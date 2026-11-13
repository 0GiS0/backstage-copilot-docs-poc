import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { createRouter } from './router';
import { createLicenseCheck } from './license';

/**
 * Backend plugin that exposes the Copilot SDK chat (`/chat`, `/models`).
 * The assistant reaches Backstage data through the MCP actions endpoint.
 *
 * @public
 */
export const copilotChatPlugin = createBackendPlugin({
  pluginId: 'copilot-chat',
  register(env) {
    env.registerInit({
      deps: {
        logger: coreServices.logger,
        httpRouter: coreServices.httpRouter,
        config: coreServices.rootConfig,
        discovery: coreServices.discovery,
        auth: coreServices.auth,
        httpAuth: coreServices.httpAuth,
        userInfo: coreServices.userInfo,
      },
      async init({
        logger,
        httpRouter,
        config,
        discovery,
        auth,
        httpAuth,
        userInfo,
      }) {
        const mcpUrl = `${await discovery.getBaseUrl('mcp-actions')}/v1`;
        httpRouter.use(
          await createRouter({
            logger,
            mcpUrl,
            auth,
            httpAuth,
            appBaseUrl: config.getString('app.baseUrl'),
            docsEntity: config.getString('copilotChat.docsEntity'),
            isLicensed: createLicenseCheck({
              auth,
              httpAuth,
              userInfo,
              discovery,
            }),
            defaultModel:
              config.getOptionalString('copilotChat.defaultModel') ??
              'claude-haiku-4.5',
          }),
        );
      },
    });
  },
});
