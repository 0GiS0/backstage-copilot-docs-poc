import { mockErrorHandler, mockServices } from '@backstage/backend-test-utils';
import express from 'express';
import request from 'supertest';
import http from 'node:http';
import { AddressInfo } from 'node:net';

// Explicit factory so the mock also applies when tests run from the repo root.
jest.mock('@github/copilot-sdk', () =>
  jest.requireActual('./__mocks__/@github/copilot-sdk'),
);

const {
  __getLastCreateSessionOptions,
  __resetMockSessionFactory,
  __setMockSessionFactory,
} = require('@github/copilot-sdk');

import { createRouter } from './router';

function createSession(onSend: (handlers: Map<string, any>) => void) {
  const handlers = new Map<string, (event: any) => void>();
  return {
    on: jest.fn((eventType: string, handler: (event: any) => void) => {
      handlers.set(eventType, handler);
      return jest.fn(() => handlers.delete(eventType));
    }),
    send: jest.fn(async () => onSend(handlers)),
    abort: jest.fn(async () => {}),
    disconnect: jest.fn(),
    destroy: jest.fn(),
  };
}

describe('createRouter', () => {
  let app: express.Express;

  beforeEach(async () => {
    const router = await createRouter({
      logger: mockServices.logger.mock(),
      mcpUrl: 'http://localhost:7007/api/mcp-actions/v1',
      mcpToken: 'static-token',
      appBaseUrl: 'http://localhost:3000',
      docsEntity: 'default/component/engineering-handbook',
      defaultModel: 'test-model',
    });
    app = express();
    app.use(router);
    app.use(mockErrorHandler());
  });

  afterEach(() => {
    __resetMockSessionFactory();
    jest.clearAllMocks();
  });

  it('rejects chat and models without a GitHub token', async () => {
    const chat = await request(app).post('/chat').send({ message: 'Hi' });
    const models = await request(app).get('/models');

    expect(chat.status).toBe(401);
    expect(models.status).toBe(401);
    expect(models.body).toEqual({ error: 'Missing X-GitHub-Token header' });
  });

  it('rejects unlicensed users before doing any work', async () => {
    const licensedRouter = await createRouter({
      logger: mockServices.logger.mock(),
      mcpUrl: 'http://localhost:7007/api/mcp-actions/v1',
      appBaseUrl: 'http://localhost:3000',
      docsEntity: 'default/component/engineering-handbook',
      defaultModel: 'test-model',
      isLicensed: async () => false,
    });
    const licensedApp = express();
    licensedApp.use(licensedRouter);
    licensedApp.use(mockErrorHandler());

    const chat = await request(licensedApp)
      .post('/chat')
      .set('X-GitHub-Token', 'fake-token')
      .send({ message: 'Hi' });
    const models = await request(licensedApp)
      .get('/models')
      .set('X-GitHub-Token', 'fake-token');

    expect(chat.status).toBe(403);
    expect(models.status).toBe(403);
  });

  it('rejects chat without a message', async () => {
    const response = await request(app)
      .post('/chat')
      .set('X-GitHub-Token', 'fake-token')
      .send({});

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'message is required' });
  });

  it('streams deltas and tool progress, then completes on idle', async () => {
    const session = createSession(handlers => {
      handlers.get('tool.execution_start')?.({
        data: { toolName: 'search.query', invocationId: 'tool-1' },
      });
      handlers.get('tool.execution_complete')?.({
        data: { invocationId: 'tool-1', success: true },
      });
      handlers.get('assistant.message_delta')?.({
        data: { deltaContent: 'Hello' },
      });
      handlers.get('session.idle')?.({ data: {} });
    });
    __setMockSessionFactory(() => session);

    const response = await request(app)
      .post('/chat')
      .set('X-GitHub-Token', 'fake-token')
      .send({ message: 'What is the rollback procedure?' });

    expect(response.status).toBe(200);
    expect(response.text).toContain('"type":"session"');
    expect(response.text).toContain(
      '"type":"progress","action":"tool_start","tool":"search.query"',
    );
    expect(response.text).toContain(
      '"type":"progress","action":"tool_end","tool":"search.query","success":true',
    );
    expect(response.text).toContain('"type":"delta","content":"Hello"');
    expect(response.text).toContain('"type":"done"');
    expect(session.disconnect).toHaveBeenCalledTimes(1);
  });

  it('separates consecutive assistant messages with a blank line', async () => {
    __setMockSessionFactory(() =>
      createSession(handlers => {
        const delta = handlers.get('assistant.message_delta');
        delta?.({ data: { messageId: 'm1', deltaContent: 'Searching.' } });
        delta?.({ data: { messageId: 'm2', deltaContent: 'Here' } });
        delta?.({ data: { messageId: 'm2', deltaContent: ' it is.' } });
        handlers.get('session.idle')?.({ data: {} });
      }),
    );

    const response = await request(app)
      .post('/chat')
      .set('X-GitHub-Token', 'fake-token')
      .send({ message: 'Hello' });

    expect(response.text).toContain('"content":"Searching."');
    expect(response.text).toContain('"content":"\\n\\nHere"');
    expect(response.text).toContain('"content":" it is."');
  });

  it('reports asynchronous session errors and aborts generation', async () => {
    const session = createSession(handlers => {
      handlers.get('assistant.message_delta')?.({
        data: { deltaContent: 'Partial' },
      });
      handlers.get('session.error')?.({ data: { message: 'Model failed' } });
      handlers.get('session.idle')?.({ data: {} });
    });
    __setMockSessionFactory(() => session);

    const response = await request(app)
      .post('/chat')
      .set('X-GitHub-Token', 'fake-token')
      .send({ message: 'Hello' });

    expect(response.text).toContain('"type":"error","error":"Model failed"');
    expect(response.text).not.toContain('"type":"done"');
    expect(session.abort).toHaveBeenCalledTimes(1);
    expect(session.disconnect).toHaveBeenCalledTimes(1);
  });

  it('aborts generation when the client disconnects mid-stream', async () => {
    // send() resolves without ever emitting session.idle
    const session = createSession(() => {});
    __setMockSessionFactory(() => session);

    const server = app.listen(0);
    try {
      const { port } = server.address() as AddressInfo;
      await new Promise<void>((resolve, reject) => {
        const req = http.request(
          {
            port,
            method: 'POST',
            path: '/chat',
            headers: {
              'Content-Type': 'application/json',
              'X-GitHub-Token': 'fake-token',
            },
          },
          res => {
            res.once('data', () => {
              req.destroy();
              resolve();
            });
          },
        );
        req.on('error', () => {});
        req.once('error', reject);
        req.end(JSON.stringify({ message: 'Hello' }));
      });

      for (let i = 0; i < 50 && !session.disconnect.mock.calls.length; i++) {
        await new Promise(r => setTimeout(r, 10));
      }
      expect(session.abort).toHaveBeenCalledTimes(1);
      expect(session.disconnect).toHaveBeenCalledTimes(1);
    } finally {
      server.close();
    }
  });

  it('configures the Backstage MCP server and restricts permissions', async () => {
    __setMockSessionFactory(() =>
      createSession(handlers => handlers.get('session.idle')?.({ data: {} })),
    );

    await request(app)
      .post('/chat')
      .set('X-GitHub-Token', 'fake-token')
      .send({ message: 'Hello' });

    const options = __getLastCreateSessionOptions();
    expect(options.model).toBe('test-model');
    expect(options.mcpServers['backstage-mcp']).toEqual(
      expect.objectContaining({
        url: 'http://localhost:7007/api/mcp-actions/v1',
        headers: { Authorization: 'Bearer static-token' },
      }),
    );
    expect(options.systemMessage.content).toContain(
      'http://localhost:3000/docs/default/component/engineering-handbook',
    );
    await expect(options.onPermissionRequest({ kind: 'mcp' })).resolves.toEqual(
      { kind: 'approve-once' },
    );
    await expect(
      options.onPermissionRequest({ kind: 'shell' }),
    ).resolves.toEqual({ kind: 'reject' });
  });
});
