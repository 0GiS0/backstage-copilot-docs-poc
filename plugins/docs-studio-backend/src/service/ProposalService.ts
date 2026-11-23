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
  AuthService,
  BackstageCredentials,
  BackstageUserPrincipal,
  LoggerService,
  PermissionsService,
} from '@backstage/backend-plugin-api';
import { Entity, parseEntityRef } from '@backstage/catalog-model';
import {
  ConflictError,
  InputError,
  NotAllowedError,
  NotFoundError,
} from '@backstage/errors';
import { CatalogService } from '@backstage/plugin-catalog-node';
import {
  AuthorizeResult,
  ResourcePermission,
} from '@backstage/plugin-permission-common';
import {
  CheckState,
  docsStudioProposalApprovePermission,
  docsStudioProposalCreatePermission,
  DocsStudioIdentity,
  PageContent,
  ProposalApproval,
  ProposalAuthor,
  ProposalDetail,
  ProposalFile,
  ProposalKind,
  ProposalStatus,
  ProposalSummary,
} from '@internal/backstage-plugin-docs-studio-common';
import { randomUUID } from 'node:crypto';
import { posix } from 'node:path';
import { ProposalStore } from '../database/ProposalStore';
import {
  DocsLocation,
  DocsResolver,
  isInDocsScope,
  toDocsRelativePath,
  toRepoPath,
} from '../docs/resolver';
import { insertNavEntry } from '../docs/mkdocs';
import {
  contentTypeFor,
  docPathCandidates,
  isImagePath,
  joinPath,
  normalizeRelativePath,
  slugify,
} from '../docs/paths';
import {
  CommitFileChange,
  CommitStatusState,
  GithubGateway,
  GithubPullRequest,
  GithubPullRequestFile,
  RepoRef,
} from '../github/gateway';
import {
  ContentConflictError,
  MergeBlockedError,
  ShaMismatchError,
} from '../github/errors';
import { CallerIdentity, IdentityResolver } from './identity';
import {
  buildPullRequestBody,
  decodeMetadata,
  extractDescription,
  ProposalMetadata,
} from './metadata';
import {
  approvalThresholdMet,
  approveBlockedReason,
  buildCommitMessage,
  canReceiveApproval,
  computeCommitAuthor,
  currentApprovals,
  failureDescription,
  isAuthor,
  pendingDescription,
  pullRequestTitle,
  successDescription,
} from './rules';
import {
  DocsStudioSettings,
  isActiveStatus,
  NewProposalRecord,
  ProposalRecord,
  StoredAuthor,
} from './types';
import {
  CommitRequest,
  parsePagePath,
  prepareAssets,
  PreparedAsset,
} from './validation';
import { CreateProposalRequest } from '@internal/backstage-plugin-docs-studio-common';

export type UserCredentials = BackstageCredentials<BackstageUserPrincipal>;

export interface ProposalListQuery {
  entityRef?: string;
  path?: string;
  scope: 'mine' | 'toApprove' | 'all';
  status: 'open' | 'closed' | 'any';
}

export interface ProposalServiceOptions {
  auth: AuthService;
  store: ProposalStore;
  gateway: GithubGateway;
  resolver: DocsResolver;
  identity: IdentityResolver;
  permissions: PermissionsService;
  catalog: CatalogService;
  settings: DocsStudioSettings;
  logger: LoggerService;
}

/** A proposal returned by a mutation, with an optional warning for the UI. */
export interface ProposalResult {
  proposal: ProposalDetail;
  /** Set when approving succeeded but GitHub refused the automatic merge. */
  mergeError?: string;
}

const LIST_STATE = {
  open: 'active',
  closed: 'finished',
  any: 'any',
} as const;

const OUT_OF_SCOPE_MESSAGE =
  'The pull request also changes files outside this documentation, so it cannot be approved or published in Docs Studio';
const OUT_OF_SCOPE_DESCRIPTION = 'Changes files outside this documentation';

/** The App itself, GitHub's web committer and other bots. */
function isAutomationLogin(login: string, botLogin: string): boolean {
  const lower = login.toLowerCase();
  return (
    lower === botLogin.toLowerCase() ||
    lower === 'web-flow' ||
    lower.endsWith('[bot]')
  );
}

/** Serializes the changes of a page: commits, reviews and syncs. */
function lockKey(record: { entityRef: string; path: string }): string {
  return `${record.entityRef}#${record.path}`;
}

/** Whether a changed file, and its previous path, belong to the docs. */
function isFileInScope(
  docs: DocsLocation,
  file: GithubPullRequestFile,
): boolean {
  return (
    isInDocsScope(docs, file.path) &&
    (!file.previousPath || isInDocsScope(docs, file.previousPath))
  );
}

const MAX_DETAIL_FILES = 50;
const MAX_FILE_CONTENT_BYTES = 512 * 1024;

function publicAuthor(author: StoredAuthor): ProposalAuthor {
  return {
    userEntityRef: author.userEntityRef,
    displayName: author.displayName,
    licensed: author.licensed,
    githubLogin: author.githubLogin,
  };
}

function optionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

/** An author from a pull request body, which is untrusted input. */
function sanitizeAuthor(value: unknown): StoredAuthor[] {
  const input = (value ?? {}) as Record<string, unknown>;
  const displayName = optionalText(input.displayName);
  if (!displayName) {
    return [];
  }
  return [
    {
      userEntityRef: optionalText(input.userEntityRef),
      displayName,
      licensed: input.licensed === true,
      githubLogin: optionalText(input.githubLogin),
    },
  ];
}

function sanitizeApproval(value: unknown): ProposalApproval[] {
  const input = (value ?? {}) as Record<string, unknown>;
  const userEntityRef = optionalText(input.userEntityRef);
  const sha = optionalText(input.sha);
  if (!userEntityRef || !sha) {
    return [];
  }
  return [
    {
      userEntityRef,
      displayName: optionalText(input.displayName) ?? userEntityRef,
      sha,
      createdAt: optionalText(input.createdAt) ?? new Date().toISOString(),
      comment: optionalText(input.comment),
    },
  ];
}

function stripTitlePrefix(title: string): string {
  return title.replace(/^docs:\s*/i, '').trim() || title;
}

export class ProposalService {
  private readonly auth: AuthService;
  private readonly store: ProposalStore;
  private readonly gateway: GithubGateway;
  private readonly resolver: DocsResolver;
  private readonly identity: IdentityResolver;
  private readonly permissions: PermissionsService;
  private readonly catalog: CatalogService;
  private readonly settings: DocsStudioSettings;
  private readonly logger: LoggerService;
  private readonly locks = new Map<string, Promise<unknown>>();

  constructor(options: ProposalServiceOptions) {
    this.auth = options.auth;
    this.store = options.store;
    this.gateway = options.gateway;
    this.resolver = options.resolver;
    this.identity = options.identity;
    this.permissions = options.permissions;
    this.catalog = options.catalog;
    this.settings = options.settings;
    this.logger = options.logger;
  }

  // ---------------------------------------------------------------- identity

  async getIdentity(credentials: UserCredentials): Promise<DocsStudioIdentity> {
    const { ownershipEntityRefs: _ignored, ...identity } =
      await this.identity.fromCredentials(credentials);
    return identity;
  }

  // ------------------------------------------------------------------- pages

  async getPage(
    credentials: UserCredentials,
    query: { entityRef: string; docPath: string; proposalId?: string },
  ): Promise<PageContent> {
    const { entity, docs, ref } = await this.docsContext(credentials, query);
    const candidates = docPathCandidates(query.docPath);
    for (const candidate of candidates) {
      const file = await this.gateway.getFile(
        docs.repo,
        toRepoPath(docs, candidate),
        ref,
      );
      if (!file) {
        continue;
      }
      const identity = await this.identity.fromCredentials(credentials);
      const open = await this.store.findActive(query.entityRef, candidate);
      return {
        entityRef: query.entityRef,
        docPath: query.docPath,
        path: candidate,
        repoPath: file.path,
        sha: file.sha,
        content: file.bytes.toString('utf8'),
        ref,
        openProposal: open ? this.toSummary(open) : undefined,
        docsDir: docs.docsDir,
        assetsDir: docs.assetsDir,
        editUrl: identity.licensed
          ? `https://${docs.repo.host}/${docs.repo.owner}/${docs.repo.repo}/edit/${docs.defaultBranch}/${file.path}`
          : undefined,
      };
    }
    throw new NotFoundError(
      `No Markdown page found for "${query.docPath}" in ${entity.metadata.name}`,
    );
  }

  async getAsset(
    credentials: UserCredentials,
    query: { entityRef: string; path: string; proposalId?: string },
  ): Promise<{ bytes: Buffer; contentType: string }> {
    const { docs, ref } = await this.docsContext(credentials, query);
    const path = normalizeRelativePath(query.path, 'path');
    const file = await this.gateway.getFile(
      docs.repo,
      toRepoPath(docs, path),
      ref,
    );
    if (!file) {
      throw new NotFoundError(`Asset ${path} not found`);
    }
    return { bytes: file.bytes, contentType: contentTypeFor(path) };
  }

  private async docsContext(
    credentials: UserCredentials,
    query: { entityRef: string; proposalId?: string },
  ) {
    const entity = await this.readEntity(query.entityRef, credentials);
    const docs = await this.resolver.resolve(entity);
    let ref = docs.defaultBranch;
    if (query.proposalId) {
      const proposal = await this.store.get(query.proposalId);
      if (!proposal || proposal.entityRef !== query.entityRef) {
        throw new NotFoundError('Proposal not found');
      }
      ref = isActiveStatus(proposal.status)
        ? proposal.branch
        : proposal.headSha;
    }
    return { entity, docs, ref };
  }

  // --------------------------------------------------------------- listing

  async listProposals(
    credentials: UserCredentials,
    query: ProposalListQuery,
  ): Promise<ProposalSummary[]> {
    const identity = await this.identity.fromCredentials(credentials);
    if (query.entityRef) {
      await this.readEntity(query.entityRef, credentials);
    }
    let records = await this.store.list({
      entityRef: query.entityRef,
      path: query.path,
      state: LIST_STATE[query.status],
      authorRef: query.scope === 'mine' ? identity.userEntityRef : undefined,
    });
    if (!query.entityRef) {
      const readable = await this.readableEntityRefs(
        credentials,
        records.map(r => r.entityRef),
      );
      records = records.filter(r => readable.has(r.entityRef));
    }
    if (query.scope === 'toApprove') {
      const candidates = records.filter(
        r =>
          canReceiveApproval(r.status) &&
          approveBlockedReason({
            status: r.status,
            authors: r.authors,
            approvals: r.approvals,
            headSha: r.headSha,
            userEntityRef: identity.userEntityRef,
          }) === undefined,
      );
      const allowed = new Map<string, boolean>();
      for (const entityRef of new Set(candidates.map(r => r.entityRef))) {
        const [canApprove] = await this.authorize(credentials, entityRef, [
          docsStudioProposalApprovePermission,
        ]);
        allowed.set(entityRef, canApprove);
      }
      records = candidates.filter(r => allowed.get(r.entityRef));
    }
    return records.map(r => this.toSummary(r));
  }

  async getProposal(
    credentials: UserCredentials,
    id: string,
  ): Promise<ProposalDetail> {
    const { record, entity } = await this.loadReadable(credentials, id);
    const identity = await this.identity.fromCredentials(credentials);
    return this.buildDetail(record, identity, credentials, entity);
  }

  // ------------------------------------------------------------- mutations

  async createProposal(
    credentials: UserCredentials,
    request: CreateProposalRequest,
  ): Promise<{ proposal: ProposalDetail; created: boolean }> {
    const identity = await this.identity.fromCredentials(credentials);
    const entity = await this.readEntity(request.entityRef, credentials);
    await this.assertAllowed(
      credentials,
      request.entityRef,
      docsStudioProposalCreatePermission,
      'propose changes to this documentation',
    );
    const docs = await this.resolver.resolve(entity);
    await this.gateway.assertCanWrite(docs.repo);
    const assets = prepareAssets(request.assets, this.settings.maxAssetSizeMb);

    return this.withLock(lockKey(request), async () => {
      const existing = await this.store.findActive(
        request.entityRef,
        request.path,
      );
      if (existing) {
        const joined = await this.pushToExisting({
          record: existing,
          identity,
          docs,
          content: request.content,
          baseSha: request.baseSha ?? '',
          assets,
          message: request.message,
          mode: request.kind,
        });
        return {
          proposal: await this.buildDetail(
            joined,
            identity,
            credentials,
            entity,
          ),
          created: false,
        };
      }
      const record = await this.createNew({
        request,
        identity,
        docs,
        assets,
      });
      return {
        proposal: await this.buildDetail(record, identity, credentials, entity),
        created: true,
      };
    });
  }

  async commit(
    credentials: UserCredentials,
    id: string,
    request: CommitRequest,
  ): Promise<ProposalDetail> {
    const { record, entity } = await this.loadReadable(credentials, id);
    const identity = await this.identity.fromCredentials(credentials);
    await this.assertAllowed(
      credentials,
      record.entityRef,
      docsStudioProposalCreatePermission,
      'propose changes to this documentation',
    );
    const docs = await this.resolver.resolve(entity);
    await this.gateway.assertCanWrite(docs.repo);
    const assets = prepareAssets(request.assets, this.settings.maxAssetSizeMb);
    const updated = await this.withLock(lockKey(record), () =>
      this.pushToExisting({
        record,
        identity,
        docs,
        content: request.content,
        baseSha: request.baseSha,
        assets,
        message: request.message,
        mode: 'edit',
      }),
    );
    return this.buildDetail(updated, identity, credentials, entity);
  }

  async approve(
    credentials: UserCredentials,
    id: string,
    input: { comment?: string; sha?: string },
  ): Promise<ProposalResult> {
    const loaded = await this.loadReadable(credentials, id);
    const identity = await this.identity.fromCredentials(credentials);
    await this.assertAllowed(
      credentials,
      loaded.record.entityRef,
      docsStudioProposalApprovePermission,
      'approve this proposal',
    );
    const { record, mergeError } = await this.withLock(
      lockKey(loaded.record),
      async () => {
        let current = await this.refreshUnlocked(loaded.record);
        const reason = approveBlockedReason({
          status: current.status,
          authors: current.authors,
          approvals: current.approvals,
          headSha: current.headSha,
          userEntityRef: identity.userEntityRef,
        });
        if (reason === 'author') {
          throw new NotAllowedError('You cannot approve your own proposal');
        }
        if (reason === 'already-approved') {
          throw new ConflictError('You already approved this version');
        }
        if (reason === 'not-open') {
          throw new ConflictError(`This proposal is ${current.status}`);
        }
        if (input.sha && input.sha !== current.headSha) {
          throw new ConflictError(
            'The proposal changed after you opened it. Reload it and review the new version.',
          );
        }
        await this.assertInScope(current);
        await this.gateway.assertCanWrite(this.repoRef(current));

        const approvedSha = current.headSha;
        const now = new Date().toISOString();
        await this.store.addApproval(id, {
          userEntityRef: identity.userEntityRef,
          displayName: identity.displayName,
          sha: approvedSha,
          createdAt: now,
          comment: input.comment,
        });
        await this.store.addEvent(id, {
          type: 'approved',
          actor: this.actorOf(identity),
          sha: approvedSha,
          message: input.comment,
        });
        current = (await this.store.get(id))!;
        const met = approvalThresholdMet(
          current.approvals,
          approvedSha,
          current.requiredApprovals,
        );
        const updated = await this.store.update(id, {
          status: met ? 'approved' : 'open',
          updatedAt: now,
          expectedHeadSha: approvedSha,
        });
        if (!updated) {
          throw new ConflictError(
            'The proposal changed while it was being approved. Reload it and review the new version.',
          );
        }
        current = (await this.store.get(id))!;
        await this.applyCommitStatus(current);
        await this.updatePullRequestBody(current);

        let error: string | undefined;
        if (met && this.settings.autoMergeOnApproval) {
          try {
            current = await this.performMerge(current, identity);
          } catch (mergeFailure) {
            if (!(mergeFailure instanceof MergeBlockedError)) {
              throw mergeFailure;
            }
            error = mergeFailure.message;
            this.logger.warn(
              `Automatic merge of proposal ${id} was refused: ${error}`,
            );
          }
        }
        return { record: (await this.store.get(id))!, mergeError: error };
      },
    );
    return {
      proposal: await this.buildDetail(
        record,
        identity,
        credentials,
        loaded.entity,
      ),
      mergeError,
    };
  }

  async requestChanges(
    credentials: UserCredentials,
    id: string,
    input: { comment: string },
  ): Promise<ProposalDetail> {
    const loaded = await this.loadReadable(credentials, id);
    const identity = await this.identity.fromCredentials(credentials);
    await this.assertAllowed(
      credentials,
      loaded.record.entityRef,
      docsStudioProposalApprovePermission,
      'review this proposal',
    );
    const record = await this.withLock(lockKey(loaded.record), async () => {
      const current = await this.refreshUnlocked(loaded.record);
      if (!isActiveStatus(current.status)) {
        throw new ConflictError(`This proposal is ${current.status}`);
      }
      await this.gateway.assertCanWrite(this.repoRef(current));
      const updated = await this.store.update(id, {
        status: 'changes_requested',
        updatedAt: new Date().toISOString(),
        expectedHeadSha: current.headSha,
      });
      if (!updated) {
        throw new ConflictError(
          'The proposal changed while it was being reviewed. Reload it and review the new version.',
        );
      }
      await this.store.addEvent(id, {
        type: 'changes_requested',
        actor: this.actorOf(identity),
        sha: current.headSha,
        message: input.comment,
      });
      await this.applyCommitStatus(
        (await this.store.get(id))!,
        identity.displayName,
      );
      return (await this.store.get(id))!;
    });
    return this.buildDetail(record, identity, credentials, loaded.entity);
  }

  async merge(
    credentials: UserCredentials,
    id: string,
  ): Promise<ProposalDetail> {
    const loaded = await this.loadReadable(credentials, id);
    const identity = await this.identity.fromCredentials(credentials);
    await this.assertAllowed(
      credentials,
      loaded.record.entityRef,
      docsStudioProposalApprovePermission,
      'merge this proposal',
    );
    const record = await this.withLock(lockKey(loaded.record), async () => {
      const current = await this.refreshUnlocked(loaded.record);
      await this.gateway.assertCanWrite(this.repoRef(current));
      try {
        return await this.performMerge(current, identity);
      } catch (error) {
        if (error instanceof MergeBlockedError) {
          throw new ConflictError(
            `GitHub could not merge the pull request: ${error.message}`,
          );
        }
        throw error;
      }
    });
    return this.buildDetail(record, identity, credentials, loaded.entity);
  }

  async discard(
    credentials: UserCredentials,
    id: string,
  ): Promise<ProposalDetail> {
    const loaded = await this.loadReadable(credentials, id);
    const identity = await this.identity.fromCredentials(credentials);
    const [canApprove] = await this.authorize(
      credentials,
      loaded.record.entityRef,
      [docsStudioProposalApprovePermission],
    );
    if (
      !canApprove &&
      !isAuthor(loaded.record.authors, identity.userEntityRef)
    ) {
      throw new NotAllowedError(
        'Only the authors or the approvers can discard this proposal',
      );
    }
    let record = await this.refreshProposal(loaded.record);
    if (!isActiveStatus(record.status)) {
      throw new ConflictError(`This proposal is already ${record.status}`);
    }
    const repo = this.repoRef(record);
    await this.gateway.assertCanWrite(repo);
    await this.gateway.updatePullRequest(repo, record.prNumber, {
      state: 'closed',
    });
    await this.gateway.deleteBranch(repo, record.branch);
    await this.store.update(id, {
      status: 'closed',
      updatedAt: new Date().toISOString(),
    });
    await this.store.addEvent(id, {
      type: 'closed',
      actor: this.actorOf(identity),
      message: 'Discarded',
    });
    record = (await this.store.get(id))!;
    return this.buildDetail(record, identity, credentials, loaded.entity);
  }

  // ------------------------------------------------------ GitHub reconcile

  /**
   * Brings a proposal in line with its pull request: merged or closed on
   * GitHub, or a new head commit (which makes earlier approvals stale).
   */
  async refreshProposal(record: ProposalRecord): Promise<ProposalRecord> {
    return this.withLock(lockKey(record), () => this.refreshUnlocked(record));
  }

  /** Same as `refreshProposal`, for callers that already hold the lock. */
  private async refreshUnlocked(
    record: ProposalRecord,
  ): Promise<ProposalRecord> {
    const current = (await this.store.get(record.id)) ?? record;
    if (!isActiveStatus(current.status)) {
      return current;
    }
    const pr = await this.gateway.getPullRequest(
      this.repoRef(current),
      current.prNumber,
    );
    return this.reconcile(current, pr);
  }

  private async reconcile(
    record: ProposalRecord,
    pr: GithubPullRequest,
  ): Promise<ProposalRecord> {
    if (!isActiveStatus(record.status)) {
      return record;
    }
    const now = new Date().toISOString();
    if (pr.merged || pr.state === 'closed') {
      const status: ProposalStatus = pr.merged ? 'merged' : 'closed';
      await this.store.update(record.id, {
        status,
        headSha: pr.headSha,
        updatedAt: now,
      });
      await this.store.addEvent(record.id, {
        type: pr.merged ? 'merged' : 'closed',
        sha: pr.headSha,
        message: `${pr.merged ? 'Merged' : 'Closed'} on GitHub`,
      });
      return (await this.store.get(record.id))!;
    }
    if (pr.headSha !== record.headSha) {
      // Whoever pushed the new commits must not be able to approve them.
      const pushers = await this.newCommitAuthors(
        this.repoRef(record),
        record.prNumber,
        record.authors,
      );
      await this.store.update(record.id, {
        status: 'open',
        headSha: pr.headSha,
        updatedAt: now,
      });
      await this.store.addEvent(record.id, {
        type: 'head_changed',
        sha: pr.headSha,
        message: 'New commits were pushed to the branch',
      });
      for (const pusher of pushers) {
        await this.store.addAuthor(record.id, pusher);
        await this.store.addEvent(record.id, {
          type: 'joined',
          actor: publicAuthor(pusher),
          sha: pr.headSha,
          message: 'Pushed commits to the branch on GitHub',
        });
      }
      const updated = (await this.store.get(record.id))!;
      await this.applyCommitStatus(updated);
      await this.updatePullRequestBody(updated);
      return (await this.store.get(record.id))!;
    }
    return record;
  }

  /**
   * Makes sure the commit status on GitHub matches the proposal state. Used by
   * the sync job to heal missing or outdated statuses.
   */
  async ensureCommitStatus(record: ProposalRecord): Promise<void> {
    await this.withLock(lockKey(record), async () => {
      const current = await this.store.get(record.id);
      if (current) {
        await this.ensureCommitStatusUnlocked(current);
      }
    });
  }

  private async ensureCommitStatusUnlocked(
    record: ProposalRecord,
  ): Promise<void> {
    if (!isActiveStatus(record.status)) {
      return;
    }
    const desired = await this.effectiveStatus(record);
    let actual: CommitStatusState | undefined;
    try {
      actual = await this.gateway.getCommitStatusState(
        this.repoRef(record),
        record.headSha,
        this.settings.statusContext,
      );
    } catch (error) {
      this.logger.warn(
        `Could not read the commit status of proposal ${record.id}: ${error}`,
      );
      return;
    }
    if (actual === desired.state) {
      if (record.checkState !== actual) {
        await this.store.update(record.id, {
          checkState: actual as CheckState,
          updatedAt: record.updatedAt,
        });
      }
      return;
    }
    await this.applyCommitStatus(record);
  }

  /** Imports an open PR that Docs Studio did not create. */
  async importExternalPullRequest(options: {
    entityRef: string;
    docs: DocsLocation;
    pr: GithubPullRequest;
    files: GithubPullRequestFile[];
  }): Promise<ProposalRecord | undefined> {
    const { entityRef, docs, pr, files } = options;
    const inDocs = files
      .map(file => ({ ...file, relative: toDocsRelativePath(docs, file.path) }))
      .filter(file => file.relative !== undefined);
    if (inDocs.length === 0) {
      return undefined;
    }
    const primary =
      inDocs.find(f => f.relative!.toLowerCase().endsWith('.md')) ?? inDocs[0];
    const path = primary.relative!;
    if (await this.store.findActive(entityRef, path)) {
      return undefined;
    }
    let author: StoredAuthor = {
      displayName: pr.authorLogin ?? 'GitHub user',
      licensed: true,
      githubLogin: pr.authorLogin,
    };
    if (pr.authorLogin) {
      const mapped = await this.identity.fromGithubLogin(pr.authorLogin);
      if (mapped) {
        author = {
          userEntityRef: mapped.userEntityRef,
          displayName: mapped.displayName,
          licensed: true,
          githubLogin: pr.authorLogin,
        };
      }
    }
    const authors = [
      author,
      ...(await this.newCommitAuthors(docs.repo, pr.number, [author])),
    ];
    const record = this.recordFromPullRequest({
      id: randomUUID(),
      entityRef,
      docs,
      pr,
      path,
      kind: primary.status === 'added' ? 'create' : 'edit',
      source: 'github',
      authors,
    });
    await this.store.insert(record, [
      {
        type: 'imported',
        actor: publicAuthor(author),
        sha: pr.headSha,
        message: `Imported pull request #${pr.number}`,
      },
    ]);
    await this.applyCommitStatus((await this.store.get(record.id))!);
    return (await this.store.get(record.id))!;
  }

  /**
   * Recreates a proposal from the metadata block of a pull request that the
   * GitHub App opened and whose entity the caller has verified. Approvals in
   * the block are only trusted when the App's own commit status already
   * reports the current head as approved; otherwise the proposal starts over
   * as pending, without approvals.
   */
  async restoreFromMetadata(options: {
    docs: DocsLocation;
    pr: GithubPullRequest;
    metadata: ProposalMetadata;
  }): Promise<ProposalRecord | undefined> {
    const { docs, pr, metadata } = options;
    const entityRef = docs.entityRef;
    const path = parsePagePath(metadata.path);
    if (
      (await this.store.get(metadata.id)) ||
      (await this.store.findActive(entityRef, path))
    ) {
      return undefined;
    }
    const claimed = metadata.authors.flatMap(sanitizeAuthor);
    const authors = [
      ...claimed,
      ...(await this.newCommitAuthors(docs.repo, pr.number, claimed)),
    ];
    const record = this.recordFromPullRequest({
      id: metadata.id,
      entityRef,
      docs,
      pr,
      path,
      kind: metadata.kind,
      source: 'docs-studio',
      authors,
    });
    let state: CommitStatusState | undefined;
    try {
      state = await this.gateway.getCommitStatusState(
        docs.repo,
        pr.headSha,
        this.settings.statusContext,
      );
    } catch {
      // Without the App's own status nothing in the block is trusted.
    }
    const approvals =
      state === 'success'
        ? currentApprovals(
            metadata.approvals
              .flatMap(sanitizeApproval)
              .filter(a => !isAuthor(record.authors, a.userEntityRef)),
            pr.headSha,
          )
        : [];
    record.status = 'open';
    if (state === 'failure') {
      record.status = 'changes_requested';
    } else if (approvals.length >= record.requiredApprovals) {
      record.status = 'approved';
    }
    await this.store.insert(record, [
      {
        type: 'imported',
        sha: pr.headSha,
        message: 'Restored from the pull request metadata',
      },
    ]);
    for (const approval of approvals) {
      await this.store.addApproval(record.id, approval);
    }
    await this.applyCommitStatus((await this.store.get(record.id))!);
    return (await this.store.get(record.id))!;
  }

  // -------------------------------------------------------------- internals

  private recordFromPullRequest(options: {
    id: string;
    entityRef: string;
    docs: DocsLocation;
    pr: GithubPullRequest;
    path: string;
    kind: ProposalKind;
    source: 'docs-studio' | 'github';
    authors: ProposalAuthor[];
  }): NewProposalRecord {
    const { docs, pr } = options;
    const authors: StoredAuthor[] =
      options.authors.length > 0
        ? options.authors
        : [{ displayName: pr.authorLogin ?? 'GitHub user', licensed: true }];
    return {
      id: options.id,
      entityRef: options.entityRef,
      path: options.path,
      kind: options.kind,
      title: stripTitlePrefix(pr.title),
      description: extractDescription(pr.body),
      status: 'open',
      source: options.source,
      createdBy: authors[0],
      authors,
      requiredApprovals: this.settings.requiredApprovals,
      checkState: 'unknown',
      repoHost: docs.repo.host,
      repo: {
        owner: docs.repo.owner,
        name: docs.repo.repo,
        defaultBranch: docs.defaultBranch,
      },
      branch: pr.headRef,
      prNumber: pr.number,
      prUrl: pr.url,
      headSha: pr.headSha,
      createdAt: pr.createdAt,
      updatedAt: new Date().toISOString(),
    };
  }

  private async createNew(options: {
    request: CreateProposalRequest;
    identity: CallerIdentity;
    docs: DocsLocation;
    assets: PreparedAsset[];
  }): Promise<ProposalRecord> {
    const { request, identity, docs, assets } = options;
    const repo = docs.repo;
    const id = randomUUID();
    const entityName = parseEntityRef(request.entityRef).name;
    const branch = [
      this.settings.branchPrefix,
      slugify(entityName),
      `${slugify(request.path.replace(/\.md$/i, ''))}-${id.slice(0, 8)}`,
    ].join('/');
    const title =
      request.title ??
      `${request.kind === 'create' ? 'Add' : 'Update'} ${request.path}`;

    const baseHead = await this.gateway.getBranchHead(repo, docs.defaultBranch);
    await this.gateway.createBranch(repo, branch, baseHead);
    try {
      const { commitSha, author } = await this.pushChange({
        docs,
        identity,
        branch,
        mode: request.kind,
        path: request.path,
        content: request.content,
        baseSha: request.baseSha,
        nav: request.nav,
        assets,
        message:
          request.message ??
          `docs: ${request.kind === 'create' ? 'add' : 'update'} ${
            request.path
          }`,
        coAuthors: [],
      });
      const authors = [author];
      const proposalUrl = this.proposalUrl(id);
      const pr = await this.gateway.createPullRequest(repo, {
        title: pullRequestTitle(title),
        body: buildPullRequestBody({
          description: request.description,
          authors: authors.map(publicAuthor),
          proposalUrl,
          metadata: {
            v: 1,
            id,
            entityRef: request.entityRef,
            path: request.path,
            kind: request.kind,
            authors: authors.map(publicAuthor),
            approvals: [],
          },
        }),
        head: branch,
        base: docs.defaultBranch,
      });
      const now = new Date().toISOString();
      const record: NewProposalRecord = {
        id,
        entityRef: request.entityRef,
        path: request.path,
        kind: request.kind,
        title,
        description: request.description,
        status: 'open',
        source: 'docs-studio',
        createdBy: author,
        authors,
        requiredApprovals: this.settings.requiredApprovals,
        checkState: 'unknown',
        repoHost: repo.host,
        repo: {
          owner: repo.owner,
          name: repo.repo,
          defaultBranch: docs.defaultBranch,
        },
        branch,
        prNumber: pr.number,
        prUrl: pr.url,
        headSha: commitSha,
        createdAt: now,
        updatedAt: now,
      };
      try {
        await this.store.insert(record, [
          {
            type: 'created',
            actor: publicAuthor(author),
            sha: commitSha,
            message: title,
          },
        ]);
      } catch (error) {
        await this.gateway
          .updatePullRequest(repo, pr.number, { state: 'closed' })
          .catch(() => {});
        throw error;
      }
      const saved = (await this.store.get(id))!;
      await this.applyCommitStatus(saved);
      return (await this.store.get(id))!;
    } catch (error) {
      await this.gateway.deleteBranch(repo, branch).catch(cleanupError => {
        this.logger.warn(
          `Could not delete branch ${branch} after a failure: ${cleanupError}`,
        );
      });
      throw error;
    }
  }

  private async pushToExisting(options: {
    record: ProposalRecord;
    identity: CallerIdentity;
    docs: DocsLocation;
    content: string;
    baseSha: string;
    assets: PreparedAsset[];
    message?: string;
    mode: ProposalKind;
  }): Promise<ProposalRecord> {
    const { identity, docs } = options;
    let record = await this.refreshUnlocked(options.record);
    if (record.status !== 'open' && record.status !== 'changes_requested') {
      throw new ConflictError(
        record.status === 'approved'
          ? 'This proposal is already approved: merge it or discard it'
          : `This proposal is ${record.status}`,
      );
    }
    const coAuthors = await this.coAuthorsFor(record, identity);
    const { commitSha, author } = await this.pushChange({
      docs,
      identity,
      branch: record.branch,
      mode: options.mode,
      path: record.path,
      content: options.content,
      baseSha: options.baseSha,
      assets: options.assets,
      message: options.message ?? `docs: update ${record.path}`,
      coAuthors,
    });
    const joined = !isAuthor(record.authors, identity.userEntityRef);
    if (joined) {
      await this.store.addAuthor(record.id, author);
    }
    await this.store.update(record.id, {
      status: 'open',
      headSha: commitSha,
      updatedAt: new Date().toISOString(),
    });
    await this.store.addEvent(record.id, {
      type: joined ? 'joined' : 'commit',
      actor: publicAuthor(author),
      sha: commitSha,
      message: options.message,
    });
    record = (await this.store.get(record.id))!;
    await this.applyCommitStatus(record);
    await this.updatePullRequestBody(record);
    return (await this.store.get(record.id))!;
  }

  private async coAuthorsFor(
    record: ProposalRecord,
    identity: CallerIdentity,
  ): Promise<StoredAuthor[]> {
    const others = record.authors.filter(
      a => a.userEntityRef !== identity.userEntityRef,
    );
    const repo = this.repoRef(record);
    return Promise.all(
      others.map(async author => {
        if (author.commitEmail || !author.licensed || !author.githubLogin) {
          return author;
        }
        try {
          const id = await this.gateway.getGithubUserId(
            repo,
            author.githubLogin,
          );
          return {
            ...author,
            commitEmail: computeCommitAuthor(author, id).email,
          };
        } catch {
          return author;
        }
      }),
    );
  }

  /**
   * Validates the change against the current state of `branch` and commits
   * it, with the new page, nav entry and assets in a single commit.
   */
  private async pushChange(options: {
    docs: DocsLocation;
    identity: CallerIdentity;
    branch: string;
    mode: ProposalKind;
    path: string;
    content: string;
    baseSha?: string;
    nav?: CreateProposalRequest['nav'];
    assets: PreparedAsset[];
    message: string;
    coAuthors: StoredAuthor[];
  }): Promise<{ commitSha: string; author: StoredAuthor }> {
    const { docs, identity, branch } = options;
    const repo = docs.repo;
    const repoPath = toRepoPath(docs, options.path);

    const current = await this.gateway.getFile(repo, repoPath, branch);
    if (options.mode === 'edit') {
      if (!current) {
        throw new NotFoundError(`${options.path} does not exist`);
      }
      if (!options.baseSha) {
        throw new InputError('baseSha is required for edits');
      }
      if (current.sha !== options.baseSha) {
        throw this.conflictFor(
          'The page changed since you loaded it',
          current.sha,
          current.bytes,
        );
      }
    } else if (current) {
      throw this.conflictFor(
        `${options.path} already exists`,
        current.sha,
        current.bytes,
      );
    }
    const content = Buffer.from(options.content, 'utf8');
    if (
      current &&
      current.bytes.equals(content) &&
      options.assets.length === 0
    ) {
      throw new InputError('There are no changes to propose');
    }

    const files: CommitFileChange[] = [
      { path: repoPath, content, expectedSha: current?.sha ?? null },
    ];
    if (options.mode === 'create' && options.nav && docs.mkdocsPath) {
      const mkdocs = await this.gateway.getFile(repo, docs.mkdocsPath, branch);
      if (mkdocs) {
        const updated = insertNavEntry(mkdocs.bytes.toString('utf8'), {
          title: options.nav.title,
          filePath: options.path,
          parentPath: options.nav.parentPath,
        });
        if (updated !== undefined) {
          files.push({
            path: docs.mkdocsPath,
            content: Buffer.from(updated, 'utf8'),
            expectedSha: mkdocs.sha,
          });
        }
      }
    }
    for (const asset of options.assets) {
      const assetPath = toRepoPath(
        docs,
        joinPath(docs.assetsDir, asset.fileName),
      );
      const existing = await this.gateway.getFile(repo, assetPath, branch);
      if (existing) {
        if (existing.bytes.equals(asset.bytes)) {
          continue;
        }
        throw new ConflictError(
          `The asset ${asset.fileName} already exists with different content, use another file name`,
        );
      }
      files.push({ path: assetPath, content: asset.bytes, expectedSha: null });
    }

    let githubUserId: number | undefined;
    if (identity.licensed && identity.githubLogin) {
      githubUserId = await this.gateway
        .getGithubUserId(repo, identity.githubLogin)
        .catch(() => undefined);
    }
    const commitIdentity = computeCommitAuthor(identity, githubUserId);
    try {
      const { commitSha } = await this.gateway.commitFiles(repo, {
        branch,
        message: buildCommitMessage(options.message, options.coAuthors),
        author: commitIdentity,
        files,
      });
      return {
        commitSha,
        author: {
          userEntityRef: identity.userEntityRef,
          displayName: identity.displayName,
          licensed: identity.licensed,
          githubLogin: identity.githubLogin,
          commitEmail: commitIdentity.email,
        },
      };
    } catch (error) {
      if (error instanceof ShaMismatchError) {
        const latest = await this.gateway.getFile(
          repo,
          error.path ?? repoPath,
          branch,
        );
        throw this.conflictFor(error.message, latest?.sha, latest?.bytes);
      }
      throw error;
    }
  }

  private conflictFor(
    message: string,
    sha?: string,
    bytes?: Buffer,
  ): ContentConflictError {
    return new ContentConflictError(message, sha, bytes?.toString('utf8'));
  }

  private async performMerge(
    record: ProposalRecord,
    identity: CallerIdentity,
  ): Promise<ProposalRecord> {
    if (!this.isApproved(record)) {
      throw new ConflictError(
        'The proposal needs the required approvals for its current version before it can be merged',
      );
    }
    await this.assertInScope(record);
    const repo = this.repoRef(record);
    await this.gateway.mergePullRequest(repo, record.prNumber, {
      sha: record.headSha,
    });
    await this.store.update(record.id, {
      status: 'merged',
      updatedAt: new Date().toISOString(),
    });
    await this.store.addEvent(record.id, {
      type: 'merged',
      actor: this.actorOf(identity),
      sha: record.headSha,
    });
    await this.gateway.deleteBranch(repo, record.branch).catch(error => {
      this.logger.warn(`Could not delete branch ${record.branch}: ${error}`);
    });
    return (await this.store.get(record.id))!;
  }

  /** Approved, with enough approvals for the current head. */
  private isApproved(record: ProposalRecord): boolean {
    return (
      record.status === 'approved' &&
      approvalThresholdMet(
        record.approvals,
        record.headSha,
        record.requiredApprovals,
      )
    );
  }

  private desiredStatus(
    record: ProposalRecord,
    requestedBy?: string,
  ): { state: CommitStatusState; description: string } {
    if (record.status === 'changes_requested') {
      return {
        state: 'failure',
        description: failureDescription(requestedBy ?? 'a reviewer'),
      };
    }
    const approvals = currentApprovals(record.approvals, record.headSha);
    if (this.isApproved(record)) {
      return {
        state: 'success',
        description: successDescription(approvals.map(a => a.displayName)),
      };
    }
    return {
      state: 'pending',
      description: pendingDescription(
        approvals.length,
        record.requiredApprovals,
      ),
    };
  }

  /**
   * The people who authored or committed commits of the pull request and are
   * not among `existing` yet, as authors. Logins without a catalog user
   * cannot approve in Docs Studio and are skipped, as are the App and other
   * automation accounts.
   */
  private async newCommitAuthors(
    repo: RepoRef,
    prNumber: number,
    existing: StoredAuthor[],
  ): Promise<StoredAuthor[]> {
    const [commits, botLogin] = await Promise.all([
      this.gateway.listPullRequestCommits(repo, prNumber),
      this.gateway.getAppBotLogin(repo),
    ]);
    const logins = new Map<string, string>();
    for (const commit of commits) {
      for (const login of [commit.authorLogin, commit.committerLogin]) {
        if (login && !isAutomationLogin(login, botLogin)) {
          logins.set(login.toLowerCase(), login);
        }
      }
    }
    const known = new Set<string>();
    for (const author of existing) {
      if (author.userEntityRef) {
        known.add(author.userEntityRef);
      }
      if (author.githubLogin) {
        known.add(author.githubLogin.toLowerCase());
      }
    }
    const added: StoredAuthor[] = [];
    for (const [key, login] of logins) {
      if (known.has(key)) {
        continue;
      }
      const mapped = await this.identity.fromGithubLogin(login);
      if (!mapped || known.has(mapped.userEntityRef)) {
        continue;
      }
      known.add(mapped.userEntityRef);
      added.push({
        userEntityRef: mapped.userEntityRef,
        displayName: mapped.displayName,
        licensed: true,
        githubLogin: login,
      });
    }
    return added;
  }

  /**
   * The status to report, which is never success while the pull request
   * changes files outside the documentation of the proposal's entity.
   */
  private async effectiveStatus(
    record: ProposalRecord,
    requestedBy?: string,
  ): Promise<{ state: CommitStatusState; description: string }> {
    const desired = this.desiredStatus(record, requestedBy);
    if (desired.state !== 'success') {
      return desired;
    }
    try {
      if ((await this.filesOutsideScope(record)) > 0) {
        return { state: 'failure', description: OUT_OF_SCOPE_DESCRIPTION };
      }
    } catch (error) {
      this.logger.warn(
        `Could not check the files of proposal ${record.id}: ${error}`,
      );
      return { ...desired, state: 'pending' };
    }
    return desired;
  }

  /**
   * Number of files the pull request changes outside the documentation of
   * the proposal's entity: the directory of its `mkdocs.yml` and its docs
   * dir. Throws when it cannot be determined.
   */
  private async filesOutsideScope(
    record: ProposalRecord,
    docs?: DocsLocation,
  ): Promise<number> {
    const location = docs ?? (await this.docsOfRecord(record));
    const files = await this.gateway.listPullRequestFiles(
      this.repoRef(record),
      record.prNumber,
    );
    return files.filter(file => !isFileInScope(location, file)).length;
  }

  private async assertInScope(record: ProposalRecord): Promise<void> {
    if ((await this.filesOutsideScope(record)) > 0) {
      throw new ConflictError(OUT_OF_SCOPE_MESSAGE);
    }
  }

  private async docsOfRecord(record: ProposalRecord): Promise<DocsLocation> {
    const entity = await this.catalog.getEntityByRef(record.entityRef, {
      credentials: await this.auth.getOwnServiceCredentials(),
    });
    if (!entity) {
      throw new NotFoundError(`Entity ${record.entityRef} was not found`);
    }
    return this.resolver.resolve(entity);
  }

  /** Sets the commit status for the current head. Failures are logged only. */
  private async applyCommitStatus(
    record: ProposalRecord,
    requestedBy?: string,
  ): Promise<void> {
    if (!isActiveStatus(record.status)) {
      return;
    }
    let name = requestedBy;
    if (record.status === 'changes_requested' && !name) {
      const events = await this.store.listEvents(record.id);
      name = [...events].reverse().find(e => e.type === 'changes_requested')
        ?.actor?.displayName;
    }
    const desired = await this.effectiveStatus(record, name);
    let checkState: CheckState =
      desired.state === 'error' ? 'failure' : desired.state;
    try {
      await this.gateway.setCommitStatus(this.repoRef(record), record.headSha, {
        context: this.settings.statusContext,
        state: desired.state,
        description: desired.description,
        targetUrl: this.proposalUrl(record.id),
      });
    } catch (error) {
      checkState = 'unknown';
      this.logger.warn(
        `Could not set the commit status of proposal ${record.id}: ${error}`,
      );
    }
    await this.store.update(record.id, {
      checkState,
      updatedAt: record.updatedAt,
    });
  }

  private async updatePullRequestBody(record: ProposalRecord): Promise<void> {
    const authors = record.authors.map(publicAuthor);
    try {
      await this.gateway.updatePullRequest(
        this.repoRef(record),
        record.prNumber,
        {
          body: buildPullRequestBody({
            description: record.description,
            authors,
            proposalUrl: this.proposalUrl(record.id),
            metadata: {
              v: 1,
              id: record.id,
              entityRef: record.entityRef,
              path: record.path,
              kind: record.kind,
              authors,
              approvals: currentApprovals(record.approvals, record.headSha),
            },
          }),
        },
      );
    } catch (error) {
      this.logger.warn(
        `Could not update the pull request body of proposal ${record.id}: ${error}`,
      );
    }
  }

  // -------------------------------------------------------------- read model

  private toSummary(record: ProposalRecord): ProposalSummary {
    const { repoHost: _host, description: _description, ...rest } = record;
    return {
      ...rest,
      createdBy: publicAuthor(record.createdBy),
      authors: record.authors.map(publicAuthor),
      approvals: currentApprovals(record.approvals, record.headSha),
    };
  }

  private async buildDetail(
    record: ProposalRecord,
    identity: CallerIdentity,
    credentials: UserCredentials,
    entity: Entity,
  ): Promise<ProposalDetail> {
    const [canCreate, canApprove] = await this.authorize(
      credentials,
      record.entityRef,
      [docsStudioProposalCreatePermission, docsStudioProposalApprovePermission],
    );
    const active = isActiveStatus(record.status);
    const author = isAuthor(record.authors, identity.userEntityRef);
    let reason: ProposalDetail['permissions']['approveBlockedReason'] =
      approveBlockedReason({
        status: record.status,
        authors: record.authors,
        approvals: record.approvals,
        headSha: record.headSha,
        userEntityRef: identity.userEntityRef,
      });
    if (reason === undefined && !canApprove) {
      reason = 'not-approver';
    } else if (reason !== undefined && reason !== 'not-open' && !canApprove) {
      reason = reason === 'author' ? 'author' : 'not-approver';
    }
    const [events, { files, hiddenFileCount }] = await Promise.all([
      this.store.listEvents(record.id),
      this.loadFiles(record, entity),
    ]);
    const outOfScope = hiddenFileCount > 0;
    if (outOfScope && active && reason !== 'author') {
      reason = 'out-of-scope';
    }
    return {
      ...this.toSummary(record),
      description: record.description,
      files,
      hiddenFileCount: outOfScope ? hiddenFileCount : undefined,
      events,
      permissions: {
        canEdit:
          canCreate &&
          (record.status === 'open' || record.status === 'changes_requested'),
        canApprove: canApprove && reason === undefined,
        canMerge: canApprove && this.isApproved(record) && !outOfScope,
        canDiscard: active && (author || canApprove),
        approveBlockedReason: reason,
      },
    };
  }

  /**
   * The changed files inside the documentation of the entity, with their
   * content. Other files are only counted: their paths and content may
   * belong to documentation the reader has no access to.
   */
  private async loadFiles(
    record: ProposalRecord,
    entity: Entity,
  ): Promise<{ files: ProposalFile[]; hiddenFileCount: number }> {
    try {
      const docs = await this.resolver.resolve(entity);
      const repo = this.repoRef(record);
      const [pr, changed] = await Promise.all([
        this.gateway.getPullRequest(repo, record.prNumber),
        this.gateway.listPullRequestFiles(repo, record.prNumber),
      ]);
      const inScope = changed.filter(file => isFileInScope(docs, file));
      const files = await Promise.all(
        inScope.slice(0, MAX_DETAIL_FILES).map(async file => {
          const relative =
            toDocsRelativePath(docs, file.path) ??
            posix.relative(docs.docsDir || '.', file.path);
          const binary = isImagePath(file.path);
          const result: ProposalFile = {
            path: relative,
            repoPath: file.path,
            status: file.status,
            binary,
          };
          if (binary) {
            return result;
          }
          const [base, head] = await Promise.all([
            file.status === 'added'
              ? undefined
              : this.gateway.getFile(
                  repo,
                  file.previousPath ?? file.path,
                  pr.baseSha,
                ),
            file.status === 'removed'
              ? undefined
              : this.gateway.getFile(repo, file.path, record.headSha),
          ]);
          if (base && base.size <= MAX_FILE_CONTENT_BYTES) {
            result.baseContent = base.bytes.toString('utf8');
          }
          if (head && head.size <= MAX_FILE_CONTENT_BYTES) {
            result.headContent = head.bytes.toString('utf8');
          }
          return result;
        }),
      );
      return { files, hiddenFileCount: changed.length - inScope.length };
    } catch (error) {
      this.logger.warn(
        `Could not load the files of proposal ${record.id}: ${error}`,
      );
      return { files: [], hiddenFileCount: 0 };
    }
  }

  // --------------------------------------------------------------- helpers

  private repoRef(record: ProposalRecord) {
    return {
      host: record.repoHost,
      owner: record.repo.owner,
      repo: record.repo.name,
    };
  }

  private proposalUrl(id: string): string {
    return `${this.settings.appBaseUrl}/docs-studio/proposals/${id}`;
  }

  private actorOf(identity: CallerIdentity): ProposalAuthor {
    return {
      userEntityRef: identity.userEntityRef,
      displayName: identity.displayName,
      licensed: identity.licensed,
      githubLogin: identity.githubLogin,
    };
  }

  /** Reads the entity with the user's credentials: unreadable means 404. */
  private async readEntity(
    entityRef: string,
    credentials: UserCredentials,
  ): Promise<Entity> {
    const entity = await this.catalog.getEntityByRef(entityRef, {
      credentials,
    });
    if (!entity) {
      throw new NotFoundError(`Entity ${entityRef} not found`);
    }
    return entity;
  }

  private async readableEntityRefs(
    credentials: UserCredentials,
    entityRefs: string[],
  ): Promise<Set<string>> {
    const unique = [...new Set(entityRefs)];
    if (unique.length === 0) {
      return new Set();
    }
    const { items } = await this.catalog.getEntitiesByRefs(
      {
        entityRefs: unique,
        fields: ['kind', 'metadata.name', 'metadata.namespace'],
      },
      { credentials },
    );
    return new Set(unique.filter((_, index) => Boolean(items[index])));
  }

  private async loadReadable(credentials: UserCredentials, id: string) {
    const record = await this.store.get(id);
    if (!record) {
      throw new NotFoundError('Proposal not found');
    }
    const entity = await this.readEntity(record.entityRef, credentials);
    return { record, entity };
  }

  private async authorize(
    credentials: UserCredentials,
    entityRef: string,
    permissions: ResourcePermission[],
  ): Promise<boolean[]> {
    const decisions = await this.permissions.authorize(
      permissions.map(permission => ({ permission, resourceRef: entityRef })),
      { credentials },
    );
    return decisions.map(d => d.result === AuthorizeResult.ALLOW);
  }

  private async assertAllowed(
    credentials: UserCredentials,
    entityRef: string,
    permission: ResourcePermission,
    action: string,
  ): Promise<void> {
    const [allowed] = await this.authorize(credentials, entityRef, [
      permission,
    ]);
    if (!allowed) {
      throw new NotAllowedError(`You are not allowed to ${action}`);
    }
  }

  /** Serializes operations on the same page within this process. */
  private async withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(key) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(fn);
    this.locks.set(key, next);
    try {
      return await next;
    } finally {
      if (this.locks.get(key) === next) {
        this.locks.delete(key);
      }
    }
  }
}

export { parsePagePath, decodeMetadata };
