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

import { AuthService, LoggerService } from '@backstage/backend-plugin-api';
import {
  Entity,
  parseEntityRef,
  stringifyEntityRef,
} from '@backstage/catalog-model';
import { CATALOG_FILTER_EXISTS } from '@backstage/catalog-client';
import { CatalogService } from '@backstage/plugin-catalog-node';
import { ProposalStore } from '../database/ProposalStore';
import { ANNOTATION_TECHDOCS_REF } from '../docs/location';
import {
  DocsLocation,
  DocsResolver,
  toDocsRelativePath,
} from '../docs/resolver';
import { GithubGateway, GithubPullRequest, RepoRef } from '../github/gateway';
import { decodeMetadata, ProposalMetadata } from '../service/metadata';
import { ProposalService } from '../service/ProposalService';
import { parsePagePath } from '../service/validation';

export interface SynchronizerOptions {
  store: ProposalStore;
  gateway: GithubGateway;
  resolver: DocsResolver;
  service: ProposalService;
  catalog: CatalogService;
  auth: AuthService;
  logger: LoggerService;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function repoKey(repo: RepoRef): string {
  return `${repo.host}/${repo.owner}/${repo.repo}`.toLowerCase();
}

/**
 * Keeps the database in line with GitHub: refreshes open proposals, rebuilds
 * lost rows and imports pull requests that were not created by Docs Studio.
 * Every step is isolated so one failing repository never stops the others.
 */
export class Synchronizer {
  /** Pull requests that were inspected and are not relevant, by number and head. */
  private readonly ignored = new Set<string>();

  constructor(private readonly options: SynchronizerOptions) {}

  async run(): Promise<void> {
    await this.refreshOpenProposals();
    await this.discoverPullRequests();
  }

  private async refreshOpenProposals(): Promise<void> {
    const { store, service, logger } = this.options;
    const active = await store.list({ state: 'active' });
    for (const record of active) {
      try {
        const refreshed = await service.refreshProposal(record);
        await service.ensureCommitStatus(refreshed);
      } catch (error) {
        logger.warn(`Could not refresh proposal ${record.id}: ${error}`);
      }
    }
  }

  private async discoverPullRequests(): Promise<void> {
    const { catalog, auth, logger } = this.options;
    let entities: Entity[];
    try {
      const { items } = await catalog.getEntities(
        {
          filter: {
            [`metadata.annotations.${ANNOTATION_TECHDOCS_REF}`]:
              CATALOG_FILTER_EXISTS,
          },
        },
        { credentials: await auth.getOwnServiceCredentials() },
      );
      entities = items;
    } catch (error) {
      logger.warn(`Could not list the entities with docs: ${error}`);
      return;
    }

    const byRepo = new Map<string, { repo: RepoRef; docs: DocsLocation[] }>();
    for (const entity of entities) {
      try {
        const docs = await this.options.resolver.resolve(entity);
        const key = repoKey(docs.repo);
        const group = byRepo.get(key) ?? { repo: docs.repo, docs: [] };
        group.docs.push({ ...docs, entityRef: stringifyEntityRef(entity) });
        byRepo.set(key, group);
      } catch {
        // Not a GitHub location or not reachable: nothing to sync.
      }
    }

    for (const { repo, docs } of byRepo.values()) {
      try {
        await this.syncRepository(repo, docs);
      } catch (error) {
        logger.warn(`Could not sync ${repo.owner}/${repo.repo}: ${error}`);
      }
    }
  }

  private async syncRepository(
    repo: RepoRef,
    locations: DocsLocation[],
  ): Promise<void> {
    const { gateway, store, service, logger } = this.options;
    if (!(await gateway.hasAppInstallation(repo))) {
      return;
    }
    const pulls = await gateway.listOpenPullRequests(repo);
    for (const pr of pulls) {
      const ignoreKey = `${repoKey(repo)}#${pr.number}@${pr.headSha}`;
      if (pr.fromFork || this.ignored.has(ignoreKey)) {
        continue;
      }
      try {
        if (await store.getByPullRequest(repo, pr.number)) {
          continue;
        }
        const files = await gateway.listPullRequestFiles(repo, pr.number);
        const owner = this.mostSpecificOwner(
          locations,
          files.map(f => f.path),
        );
        if (!owner) {
          this.ignored.add(ignoreKey);
          continue;
        }
        const metadata = decodeMetadata(pr.body);
        if (metadata) {
          const rejection = await this.metadataRejection(
            repo,
            pr,
            metadata,
            owner,
          );
          if (rejection) {
            logger.info(
              `Ignoring the Docs Studio metadata of pull request #${pr.number} of ${repo.owner}/${repo.repo}: ${rejection}`,
            );
          } else {
            const restored = await service.restoreFromMetadata({
              docs: owner,
              pr,
              metadata,
            });
            if (restored) {
              logger.info(
                `Restored proposal ${restored.id} from pull request #${pr.number}`,
              );
              continue;
            }
          }
        }
        const imported = await service.importExternalPullRequest({
          entityRef: owner.entityRef,
          docs: owner,
          pr,
          files,
        });
        if (imported) {
          logger.info(
            `Imported pull request #${pr.number} as proposal ${imported.id}`,
          );
        } else {
          this.ignored.add(ignoreKey);
        }
      } catch (error) {
        logger.warn(
          `Could not sync pull request #${pr.number} of ${repo.owner}/${repo.repo}: ${error}`,
        );
      }
    }
  }

  /**
   * Why the metadata block of a pull request cannot be trusted, or
   * `undefined` when it can. Anyone who can open a pull request can also
   * write such a block, so it only counts on pull requests opened by the
   * GitHub App and only when it matches the files the pull request changes.
   */
  private async metadataRejection(
    repo: RepoRef,
    pr: GithubPullRequest,
    metadata: ProposalMetadata,
    owner: DocsLocation,
  ): Promise<string | undefined> {
    const botLogin = await this.options.gateway.getAppBotLogin(repo);
    if (pr.authorLogin?.toLowerCase() !== botLogin.toLowerCase()) {
      return 'the pull request was not opened by the Docs Studio GitHub App';
    }
    if (!UUID_PATTERN.test(metadata.id)) {
      return 'the proposal id is not valid';
    }
    let entityRef: string;
    try {
      entityRef = stringifyEntityRef(parseEntityRef(metadata.entityRef));
    } catch {
      return 'the entity reference is not valid';
    }
    if (entityRef !== owner.entityRef) {
      return 'the entity does not own the changed files';
    }
    try {
      if (parsePagePath(metadata.path) !== metadata.path) {
        return 'the page path is not normalized';
      }
    } catch {
      return 'the page path is not valid';
    }
    return undefined;
  }

  /** The entity whose docs dir is the deepest one containing a changed file. */
  private mostSpecificOwner(
    locations: DocsLocation[],
    paths: string[],
  ): DocsLocation | undefined {
    let best: DocsLocation | undefined;
    for (const docs of locations) {
      if (!paths.some(p => toDocsRelativePath(docs, p) !== undefined)) {
        continue;
      }
      if (!best || docs.docsDir.length > best.docsDir.length) {
        best = docs;
      }
    }
    return best;
  }
}
