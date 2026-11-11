import { mockErrorHandler, mockServices } from '@backstage/backend-test-utils';
import express from 'express';
import request from 'supertest';

jest.mock('@github/copilot-sdk');

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
      docsEntity: 'default/component/engineering-handbook-confluence-poc',
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
      'http://localhost:3000/docs/default/component/engineering-handbook-confluence-poc',
    );
    await expect(options.onPermissionRequest({ kind: 'mcp' })).resolves.toEqual(
      { kind: 'approve-once' },
    );
    await expect(
      options.onPermissionRequest({ kind: 'shell' }),
    ).resolves.toEqual({ kind: 'reject' });
  });
});
