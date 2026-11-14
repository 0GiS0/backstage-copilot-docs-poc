/*
 * Copyright 2026 The Docs Studio Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
  coreServices,
  createBackendPlugin,
  readSchedulerServiceTaskScheduleDefinitionFromConfig,
  resolvePackagePath,
} from '@backstage/backend-plugin-api';
import { ConfigReader } from '@backstage/config';
import { catalogServiceRef } from '@backstage/plugin-catalog-node';
import {
  DOCS_STUDIO_PLUGIN_ID,
  docsStudioPermissions,
} from '@internal/backstage-plugin-docs-studio-common';
import { ProposalStore } from './database/ProposalStore';
import { DocsResolver } from './docs/resolver';
import {
  DocsStudioGithubGatewayExtensionPoint,
  docsStudioGithubGatewayExtensionPoint,
} from './extensions';
import { GithubGateway } from './github/gateway';
import { OctokitGithubGateway } from './github/octokitGateway';
import {
  RepositoryAllowlist,
  RepositoryGuardGateway,
} from './github/repositoryGuard';
import { createRouter } from './router';
import { IdentityResolver } from './service/identity';
import { ProposalService } from './service/ProposalService';
import { readSettings } from './service/settings';
import { Synchronizer } from './sync/Synchronizer';

const DEFAULT_SYNC_FREQUENCY = { minutes: 1 };

/**
 * The Docs Studio backend plugin.
 *
 * @public
 */
export const docsStudioPlugin = createBackendPlugin({
  pluginId: DOCS_STUDIO_PLUGIN_ID,
  register(env) {
    let gateway: GithubGateway | undefined;
    const gatewayExtensionPoint: DocsStudioGithubGatewayExtensionPoint = {
      setGateway(value) {
        if (gateway) {
          throw new Error(
            'The Docs Studio GitHub gateway can only be set once',
          );
        }
        gateway = value;
      },
    };
    env.registerExtensionPoint(
      docsStudioGithubGatewayExtensionPoint,
      gatewayExtensionPoint,
    );

    env.registerInit({
      deps: {
        logger: coreServices.logger,
        config: coreServices.rootConfig,
        httpRouter: coreServices.httpRouter,
        httpAuth: coreServices.httpAuth,
        userInfo: coreServices.userInfo,
        auth: coreServices.auth,
        auditor: coreServices.auditor,
        permissions: coreServices.permissions,
        permissionsRegistry: coreServices.permissionsRegistry,
        database: coreServices.database,
        scheduler: coreServices.scheduler,
        catalog: catalogServiceRef,
      },
      async init({
        logger,
        config,
        httpRouter,
        httpAuth,
        userInfo,
        auth,
        auditor,
        permissions,
        permissionsRegistry,
        database,
        scheduler,
        catalog,
      }) {
        permissionsRegistry.addPermissions(docsStudioPermissions);

        const settings = readSettings(config);
        const baseGateway = gateway ?? OctokitGithubGateway.fromConfig(config);
        const allowlist = RepositoryAllowlist.fromConfig(config);
        if (allowlist) {
          logger.info(
            `Docs Studio limited to ${allowlist.size} repositories (docsStudio.allowedRepositories)`,
          );
        } else {
          logger.warn(
            'docsStudio.allowedRepositories is not set: Docs Studio acts on every repository its GitHub credentials can reach',
          );
        }
        const github = allowlist
          ? new RepositoryGuardGateway(baseGateway, allowlist)
          : baseGateway;

        const knex = await database.getClient();
        if (!database.migrations?.skip) {
          await knex.migrate.latest({
            directory: resolvePackagePath(
              '@internal/backstage-plugin-docs-studio-backend',
              'migrations',
            ),
          });
        }

        const store = new ProposalStore(knex);
        const resolver = new DocsResolver(github, settings.assetsDir);
        const service = new ProposalService({
          store,
          gateway: github,
          resolver,
          identity: new IdentityResolver(userInfo, catalog, auth),
          permissions,
          catalog,
          settings,
          logger,
        });

        const router = await createRouter({
          service,
          httpAuth,
          auditor,
          // Assets travel base64 encoded, up to ten per request.
          maxBodyMb: Math.ceil(10 * settings.maxAssetSizeMb * (4 / 3)) + 2,
        });
        httpRouter.use(router);

        const synchronizer = new Synchronizer({
          store,
          gateway: github,
          resolver,
          service,
          catalog,
          auth,
          logger,
        });
        const frequencyConfig = config.getOptional('docsStudio.sync.frequency');
        const schedule = readSchedulerServiceTaskScheduleDefinitionFromConfig(
          new ConfigReader({
            frequency: frequencyConfig ?? DEFAULT_SYNC_FREQUENCY,
            timeout: { minutes: 5 },
            initialDelay: { seconds: 15 },
          }),
        );
        await scheduler.scheduleTask({
          id: 'docs-studio-sync',
          scope: 'global',
          ...schedule,
          fn: async () => {
            await synchronizer.run();
          },
        });

        logger.info('Docs Studio backend initialized');
      },
    });
  },
});
