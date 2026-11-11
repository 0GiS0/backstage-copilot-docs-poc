import { LoggerService } from '@backstage/backend-plugin-api';
import { CopilotClient } from '@github/copilot-sdk';
import express from 'express';
import Router from 'express-promise-router';
import { buildSystemPrompt } from './prompt';

export interface RouterOptions {
  logger: LoggerService;
  /** Full URL of the Backstage MCP actions endpoint */
  mcpUrl: string;
  /** Static token accepted by the MCP actions endpoint */
  mcpToken?: string;
  /** Public URL of the Backstage frontend (used for citations) */
  appBaseUrl: string;
  /** Entity ref path (namespace/kind/name) that owns the docs */
  docsEntity: string;
  defaultModel: string;
}

function extractToolName(eventData: any): string | undefined {
  return (
    eventData?.mcpToolName ||
    eventData?.toolName ||
    eventData?.name ||
    eventData?.tool?.name ||
    eventData?.tool
  );
}

function extractToolExecutionId(eventData: any): string | undefined {
  return (
    eventData?.invocationId ||
    eventData?.toolCallId ||
    eventData?.callId ||
    eventData?.executionId ||
    eventData?.id
  );
}

function writeSse(res: express.Response, payload: Record<string, unknown>) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
  if (typeof (res as any).flush === 'function') {
    (res as any).flush();
  }
}

function writeProgress(
  res: express.Response,
  payload: Record<string, unknown>,
) {
  writeSse(res, { type: 'progress', ...payload });
}

async function disconnectSession(session: any) {
  if (typeof session?.disconnect === 'function') {
    await session.disconnect();
  } else if (typeof session?.destroy === 'function') {
    await session.destroy();
  }
}

const MCP_TOOLS = [
  'search.query',
  'techdocs.get-techdocs-metadata',
  'catalog.get-catalog-entity',
  'catalog.query-catalog-entities',
];

// The assistant only needs the Backstage MCP tools: approve those and reject
// everything else (shell, file system, URL fetching, ...).
const onPermissionRequest = async (request: any) =>
  request?.kind === 'mcp'
    ? ({ kind: 'approve-once' } as const)
    : ({ kind: 'reject' } as const);

export async function createRouter(
  options: RouterOptions,
): Promise<express.Router> {
  const { logger, mcpUrl, mcpToken, appBaseUrl, docsEntity, defaultModel } =
    options;
  const router = Router();
  router.use(express.json());

  const systemPrompt = buildSystemPrompt({ appBaseUrl, docsEntity });
  const mcpServers = {
    'backstage-mcp': {
      type: 'http' as const,
      url: mcpUrl,
      headers: mcpToken ? { Authorization: `Bearer ${mcpToken}` } : {},
      // Read-only tools: the assistant must not register or remove entities
      tools: MCP_TOOLS,
    },
  };

  // GET /models — list the models available to the signed-in GitHub user
  router.get('/models', async (req, res) => {
    const githubToken = req.headers['x-github-token'] as string | undefined;
    if (!githubToken) {
      res.status(401).json({ error: 'Missing X-GitHub-Token header' });
      return;
    }

    let client: CopilotClient | undefined;
    try {
      client = new CopilotClient({ gitHubToken: githubToken });
      await client.start();
      const models = await client.listModels();
      const available = models
        .filter((m: any) => m.policy?.state !== 'disabled')
        .map((m: any) => ({
          id: m.id,
          name: m.name,
          premiumRequests: m.billing?.multiplier ?? 1,
        }));
      logger.info(`[models] Listed ${available.length} available models`);
      res.json(available);
    } catch (err: any) {
      logger.error(`[models] Failed to list models: ${err.message}`);
      res.status(500).json({ error: 'Failed to list models' });
    } finally {
      await client?.stop().catch(() => {});
    }
  });

  // POST /chat — stream the answer as Server-Sent Events
  router.post('/chat', async (req, res) => {
    const githubToken = req.headers['x-github-token'] as string | undefined;
    if (!githubToken) {
      res.status(401).json({ error: 'Missing X-GitHub-Token header' });
      return;
    }

    const {
      message,
      sessionId: incomingSessionId,
      model: requestedModel,
    } = req.body ?? {};

    if (!message || typeof message !== 'string') {
      res.status(400).json({ error: 'message is required' });
      return;
    }

    const model = requestedModel || defaultModel;
    logger.info(
      `[chat] New request (model: ${model}, session: ${
        incomingSessionId ? 'existing' : 'new'
      })`,
    );

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    let client: CopilotClient | undefined;
    let session: any;

    try {
      client = new CopilotClient({ gitHubToken: githubToken });
      await client.start();

      const sessionConfig = {
        model,
        streaming: true,
        onPermissionRequest,
        mcpServers,
        systemMessage: { mode: 'append' as const, content: systemPrompt },
      } as any;

      let sessionId: string;
      if (incomingSessionId) {
        sessionId = incomingSessionId;
        session = await client.resumeSession(sessionId, sessionConfig);
        logger.info('[chat] Session resumed');
      } else {
        sessionId = `docs-chat-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}`;
        session = await client.createSession({ sessionId, ...sessionConfig });
        logger.info('[chat] Session created');
      }

      writeSse(res, { type: 'session', sessionId });

      const startTime = Date.now();
      let chunkCount = 0;
      let completed = false;
      const activeToolExecutions = new Map<string, string>();
      const unsubscribers: Array<() => void> = [];

      const cleanup = () => {
        unsubscribers.forEach(unsubscribe => unsubscribe());
        // onClose is defined below and only invoked after both exist
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        req.off('close', onClose);
      };

      const finishResponse = async () => {
        if (completed) return;
        completed = true;
        cleanup();
        await disconnectSession(session).catch(() => {});
        await client?.stop().catch(() => {});
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        logger.info(
          `[chat] Response complete: ${chunkCount} chunks in ${elapsed}s`,
        );
        writeSse(res, { type: 'done' });
        res.end();
      };

      const onClose = () => {
        if (completed) return;
        completed = true;
        logger.warn('[chat] Client disconnected');
        cleanup();
        disconnectSession(session).catch(() => {});
        client?.stop().catch(() => {});
      };
      req.on('close', onClose);

      unsubscribers.push(
        session.on('assistant.message_delta', (event: any) => {
          if (completed) return;
          chunkCount++;
          writeSse(res, {
            type: 'delta',
            content: event.data?.deltaContent ?? '',
          });
        }),
        session.on('tool.execution_start', (event: any) => {
          if (completed) return;
          const toolName = extractToolName(event.data);
          const executionId = extractToolExecutionId(event.data);
          if (executionId && toolName) {
            activeToolExecutions.set(executionId, toolName);
          }
          if (!toolName) return;
          logger.info(`[chat] Tool started: ${toolName}`);
          writeProgress(res, {
            action: 'tool_start',
            tool: toolName,
            key: `tool:${toolName}`,
            label: toolName,
            status: 'running',
          });
        }),
        session.on('tool.execution_complete', (event: any) => {
          if (completed) return;
          const executionId = extractToolExecutionId(event.data);
          const toolName =
            extractToolName(event.data) ||
            (executionId ? activeToolExecutions.get(executionId) : undefined);
          const success = event.data?.success ?? true;
          if (executionId) activeToolExecutions.delete(executionId);
          if (!toolName) return;
          logger.info(
            `[chat] Tool completed: ${toolName} (${success ? 'ok' : 'error'})`,
          );
          writeProgress(res, {
            action: 'tool_end',
            tool: toolName,
            success,
            key: `tool:${toolName}`,
            label: toolName,
            status: success ? 'completed' : 'failed',
          });
        }),
        session.on('session.idle', async () => {
          await finishResponse();
        }),
      );

      await session.send({ prompt: message });
      logger.info('[chat] Message sent; awaiting session idle');
    } catch (err: any) {
      logger.error(`[chat] Chat error: ${err.message}`);
      await disconnectSession(session).catch(() => {});
      await client?.stop().catch(() => {});
      writeSse(res, { type: 'error', error: err.message, resetSession: true });
      res.end();
    }
  });

  return router;
}
