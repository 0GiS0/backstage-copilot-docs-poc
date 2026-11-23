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
  createBackendModule,
  SchedulerServiceTaskInvocationDefinition,
} from '@backstage/backend-plugin-api';
import {
  mockCredentials,
  mockServices,
  startTestBackend,
} from '@backstage/backend-test-utils';
import { Entity } from '@backstage/catalog-model';
import type { JsonObject } from '@backstage/config';
import { catalogServiceMock } from '@backstage/plugin-catalog-node/testUtils';
import { AuthorizeResult } from '@backstage/plugin-permission-common';
import {
  DOCS_STUDIO_PLUGIN_ID,
  ProposalDetail,
} from '@internal/backstage-plugin-docs-studio-common';
import request from 'supertest';
import { docsStudioGithubGatewayExtensionPoint } from './extensions';
import { docsStudioPlugin } from './plugin';
import { encodeMetadata, ProposalMetadata } from './service/metadata';
import { FakeGithubGateway } from './testUtils/FakeGithubGateway';

const ENGINEERING = 'component:default/engineering-handbook';
const SECURITY = 'component:default/security-handbook';
const ADA = 'user:default/ada';
const BOB = 'user:default/bob';
const CAROL = 'user:default/carol';

const MKDOCS = [
  'site_name: Engineering # keep',
  'nav:',
  '  - Home: index.md',
  '  - Guides:',
  '      - Setup: guides/setup.md',
  '',
].join('\n');

function component(name: string, dir: string): Entity {
  return {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: {
      name,
      annotations: {
        'backstage.io/techdocs-ref': 'dir:.',
        'backstage.io/managed-by-location': `url:https://github.com/acme/playground/blob/main/${dir}/catalog-info.yaml`,
      },
    },
    spec: {
      type: 'documentation',
      lifecycle: 'production',
      owner: 'group:default/eng',
    },
  };
}

function user(
  name: string,
  displayName: string,
  extra: { login?: string; email?: string } = {},
): Entity {
  return {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'User',
    metadata: {
      name,
      annotations: extra.login ? { 'github.com/user-login': extra.login } : {},
    },
    spec: { profile: { displayName, email: extra.email } },
  };
}

const ENTITIES = [
  component('engineering-handbook', 'engineering'),
  component('security-handbook', 'security'),
  user('ada', 'Ada Lovelace', { login: 'ada' }),
  user('bob', 'Bob Builder', { login: 'bob' }),
  user('carol', 'Carol Unlicensed', { email: 'carol@example.com' }),
];

function repoFiles(): Record<string, string> {
  return {
    'engineering/mkdocs.yml': MKDOCS,
    'engineering/docs/index.md': '# Home\n',
    'engineering/docs/guides/setup.md': '# Setup\n\nOriginal\n',
    'security/mkdocs.yml': 'site_name: Security\n',
    'security/docs/index.md': '# Security\n',
  };
}

const stops: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(stops.splice(0).map(stop => stop()));
});

type Policy = (
  permission: string,
  entityRef: string,
  userRef: string,
) => boolean;

async function setup(config: Record<string, unknown> = {}) {
  const github = new FakeGithubGateway(repoFiles());
  github.userIds.set('ada', 1);
  github.userIds.set('bob', 2);
  const state: { policy: Policy; hidden: Set<string> } = {
    policy: () => true,
    hidden: new Set(),
  };
  const catalog = catalogServiceMock.mock({
    getEntityByRef: async ref => {
      const entity = ENTITIES.find(
        e =>
          `${e.kind}:default/${e.metadata.name}`.toLowerCase() ===
          String(ref).toLowerCase(),
      );
      return entity && !state.hidden.has(String(ref)) ? entity : undefined;
    },
    getEntitiesByRefs: async ({ entityRefs }) => ({
      items: entityRefs.map(ref =>
        ENTITIES.find(
          e => `${e.kind}:default/${e.metadata.name}`.toLowerCase() === ref,
        ),
      ),
    }),
    getEntities: async req => {
      const filter = (req?.filter ?? {}) as Record<string, unknown>;
      return {
        items: ENTITIES.filter(entity =>
          Object.entries(filter).every(([key, expected]) => {
            if (key === 'kind') {
              return entity.kind === expected;
            }
            const annotation = key.replace('metadata.annotations.', '');
            const actual = entity.metadata.annotations?.[annotation];
            return typeof expected === 'string'
              ? actual === expected
              : actual !== undefined;
          }),
        ),
      };
    },
  });
  const permissions = mockServices.permissions.mock({
    authorize: async (queries, options) =>
      queries.map(query => ({
        result: state.policy(
          query.permission.name,
          (query as { resourceRef: string }).resourceRef,
          (options!.credentials as any).principal.userEntityRef,
        )
          ? AuthorizeResult.ALLOW
          : AuthorizeResult.DENY,
      })),
  });
  let task: SchedulerServiceTaskInvocationDefinition | undefined;
  const scheduler = mockServices.scheduler.mock({
    scheduleTask: async definition => {
      task = definition as unknown as SchedulerServiceTaskInvocationDefinition;
    },
  });

  const backend = await startTestBackend({
    features: [
      docsStudioPlugin,
      createBackendModule({
        pluginId: DOCS_STUDIO_PLUGIN_ID,
        moduleId: 'test-gateway',
        register(env) {
          env.registerInit({
            deps: { gateway: docsStudioGithubGatewayExtensionPoint },
            async init({ gateway }) {
              gateway.setGateway(github);
            },
          });
        },
      }),
      catalog.factory,
      permissions.factory,
      scheduler.factory,
      mockServices.rootConfig.factory({
        data: {
          app: { baseUrl: 'http://localhost:3000' },
          docsStudio: config as JsonObject,
        },
      }),
    ],
  });

  const { server } = backend;
  stops.push(() => backend.stop());

  const call = (userRef: string) => {
    const auth = mockCredentials.user.header(userRef);
    return {
      get: (path: string) =>
        request(server)
          .get(`/api/docs-studio${path}`)
          .set('Authorization', auth),
      post: (path: string, body?: unknown) =>
        request(server)
          .post(`/api/docs-studio${path}`)
          .set('Authorization', auth)
          .send(body as object),
    };
  };
  const runSync = async () => {
    await (task as any).fn();
  };
  return { github, state, call, runSync };
}

const STATUS = 'docs-studio/approval';
const edit = (content: string, baseSha: string, extra = {}) => ({
  entityRef: ENGINEERING,
  path: 'guides/setup.md',
  kind: 'edit',
  content,
  baseSha,
  title: 'Improve setup',
  ...extra,
});

async function pageSha(
  s: Awaited<ReturnType<typeof setup>>,
  userRef = ADA,
  proposalId?: string,
) {
  const res = await s
    .call(userRef)
    .get(
      `/page?entityRef=${ENGINEERING}&docPath=guides/setup${
        proposalId ? `&proposalId=${proposalId}` : ''
      }`,
    );
  expect(res.status).toBe(200);
  return res.body as { sha: string; content: string };
}

describe('docs studio backend', () => {
  describe('reading', () => {
    it('returns the identity and the page, with editUrl only for licensed users', async () => {
      const s = await setup();
      const me = await s.call(ADA).get('/me');
      expect(me.body).toMatchObject({
        userEntityRef: ADA,
        displayName: 'Ada Lovelace',
        licensed: true,
        githubLogin: 'ada',
      });

      const page = await s
        .call(ADA)
        .get(`/page?entityRef=${ENGINEERING}&docPath=guides/setup/`);
      expect(page.body).toMatchObject({
        path: 'guides/setup.md',
        repoPath: 'engineering/docs/guides/setup.md',
        docsDir: 'engineering/docs',
        content: '# Setup\n\nOriginal\n',
        ref: 'main',
      });
      expect(page.body.editUrl).toContain('/edit/main/engineering/docs/');

      const unlicensed = await s
        .call(CAROL)
        .get(`/page?entityRef=${ENGINEERING}&docPath=`);
      expect(unlicensed.status).toBe(200);
      expect(unlicensed.body.path).toBe('index.md');
      expect(unlicensed.body.editUrl).toBeUndefined();
    });

    it('returns 404 for entities the user cannot read', async () => {
      const s = await setup();
      s.state.hidden.add(SECURITY);
      const res = await s.call(ADA).get(`/page?entityRef=${SECURITY}&docPath=`);
      expect(res.status).toBe(404);
    });

    it('streams assets with their content type', async () => {
      const s = await setup();
      const github = s.github;
      github.push('main', 'engineering/docs/attachments/a.png', 'PNGDATA');
      const res = await s
        .call(ADA)
        .get(`/asset?entityRef=${ENGINEERING}&path=attachments/a.png`)
        .buffer(true);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('image/png');
      expect(res.body.toString()).toBe('PNGDATA');
    });
  });

  describe('proposals', () => {
    it('creates a proposal with a pending status and attributes the commit', async () => {
      const s = await setup();
      const { sha } = await pageSha(s);
      const res = await s
        .call(ADA)
        .post('/proposals', edit('# Setup\n\nImproved\n', sha));
      expect(res.status).toBe(201);
      const proposal = res.body as ProposalDetail;
      expect(proposal).toMatchObject({
        status: 'open',
        path: 'guides/setup.md',
        checkState: 'pending',
        source: 'docs-studio',
        permissions: { canEdit: true, canApprove: false, canDiscard: true },
      });
      expect(proposal.permissions.approveBlockedReason).toBe('author');
      expect(proposal.files[0]).toMatchObject({
        path: 'guides/setup.md',
        baseContent: '# Setup\n\nOriginal\n',
        headContent: '# Setup\n\nImproved\n',
      });
      expect(s.github.commits[0].author).toEqual({
        name: 'Ada Lovelace',
        email: '1+ada@users.noreply.github.com',
      });
      expect(s.github.statuses.get(`${proposal.headSha}|${STATUS}`)).toBe(
        'pending',
      );
      expect(s.github.statusLog[0].targetUrl).toBe(
        `http://localhost:3000/docs-studio/proposals/${proposal.id}`,
      );
      // The page now points at the open proposal.
      const page = await s
        .call(ADA)
        .get(`/page?entityRef=${ENGINEERING}&docPath=guides/setup`);
      expect(page.body.openProposal.id).toBe(proposal.id);
    });

    it('refuses unlicensed users without an email and uses it otherwise', async () => {
      const s = await setup();
      const { sha } = await pageSha(s);
      const res = await s
        .call(CAROL)
        .post('/proposals', edit('# Setup\n\nFrom Carol\n', sha));
      expect(res.status).toBe(201);
      expect(s.github.commits[0].author.email).toBe('carol@example.com');
    });

    it('lets a second user join the open proposal as co-author', async () => {
      const s = await setup();
      const { sha } = await pageSha(s);
      const first = await s
        .call(ADA)
        .post('/proposals', edit('# Setup\n\nImproved\n', sha));
      const second = await s
        .call(BOB)
        .post(
          '/proposals',
          edit('# Setup\n\nImproved more\n', sha, { message: 'docs: more' }),
        );
      // Bob's base is stale: the branch already changed.
      expect(second.status).toBe(409);
      expect(second.body.currentContent).toBe('# Setup\n\nImproved\n');
      expect(second.body.currentSha).toBeDefined();
      expect(second.body.error.name).toBe('ConflictError');

      const fresh = await pageSha(s, BOB, first.body.id);
      const joined = await s.call(BOB).post(
        '/proposals',
        edit('# Setup\n\nImproved more\n', fresh.sha, {
          message: 'docs: more',
        }),
      );
      expect(joined.status).toBe(200);
      expect(joined.body.id).toBe(first.body.id);
      expect(joined.body.authors.map((a: any) => a.userEntityRef)).toEqual([
        ADA,
        BOB,
      ]);
      expect(joined.body.events.map((e: any) => e.type)).toEqual([
        'created',
        'joined',
      ]);
      const last = s.github.commits[s.github.commits.length - 1];
      expect(last.author.email).toBe('2+bob@users.noreply.github.com');
      expect(last.message).toContain(
        'Co-authored-by: Ada Lovelace <1+ada@users.noreply.github.com>',
      );
      const pr = s.github.pullRequest(1);
      expect(pr.body).toContain('docs-studio:metadata');
      expect(pr.body).toContain('Bob Builder');
    });

    it('reports conflicts on commits with the current content', async () => {
      const s = await setup();
      const { sha } = await pageSha(s);
      const created = await s
        .call(ADA)
        .post('/proposals', edit('# Setup\n\nImproved\n', sha));
      const res = await s
        .call(ADA)
        .post(`/proposals/${created.body.id}/commits`, {
          content: 'x',
          baseSha: sha,
        });
      expect(res.status).toBe(409);
      expect(res.body.currentContent).toBe('# Setup\n\nImproved\n');
    });

    it('creates a new page with its nav entry and assets in one commit', async () => {
      const s = await setup();
      const res = await s.call(ADA).post('/proposals', {
        entityRef: ENGINEERING,
        path: 'guides/new-page.md',
        kind: 'create',
        content: '# New\n\n![x](../attachments/x.png)\n',
        title: 'Add a page',
        nav: { title: 'New page', parentPath: 'guides/setup.md' },
        assets: [
          {
            fileName: 'x.png',
            contentBase64: Buffer.from('PNG').toString('base64'),
          },
        ],
      });
      expect(res.status).toBe(201);
      expect(s.github.commits[0].paths).toEqual([
        'engineering/docs/guides/new-page.md',
        'engineering/mkdocs.yml',
        'engineering/docs/attachments/x.png',
      ]);
      const branch = res.body.branch;
      expect(s.github.fileAt(branch, 'engineering/mkdocs.yml')).toMatch(
        /Setup: guides\/setup.md\n\s+- New page: guides\/new-page.md/,
      );
      expect(s.github.fileAt(branch, 'engineering/mkdocs.yml')).toContain(
        '# keep',
      );
      expect(
        s.github.fileAt('main', 'engineering/docs/guides/new-page.md'),
      ).toBeUndefined();

      const detail = (await s.call(BOB).get(`/proposals/${res.body.id}`)).body;
      const nav = detail.files.find(
        (f: any) => f.repoPath === 'engineering/mkdocs.yml',
      );
      expect(nav).toMatchObject({ path: '../mkdocs.yml', status: 'modified' });
      expect(nav.headContent).toContain('New page: guides/new-page.md');
      expect(detail.hiddenFileCount).toBeUndefined();
      expect(detail.permissions.canApprove).toBe(true);
    });

    it('rejects pages that exist, bad paths and non-image assets', async () => {
      const s = await setup();
      const exists = await s.call(ADA).post('/proposals', {
        entityRef: ENGINEERING,
        path: 'guides/setup.md',
        kind: 'create',
        content: 'x',
      });
      expect(exists.status).toBe(409);
      const traversal = await s.call(ADA).post('/proposals', {
        entityRef: ENGINEERING,
        path: '../mkdocs.yml',
        kind: 'create',
        content: 'x',
      });
      expect(traversal.status).toBe(400);
      const asset = await s.call(ADA).post('/proposals', {
        entityRef: ENGINEERING,
        path: 'guides/other.md',
        kind: 'create',
        content: 'x',
        assets: [{ fileName: 'evil.exe', contentBase64: 'QQ==' }],
      });
      expect(asset.status).toBe(400);
    });

    it('enforces the create permission', async () => {
      const s = await setup();
      const { sha } = await pageSha(s);
      s.state.policy = permission =>
        permission !== 'docs-studio.proposal.create';
      const res = await s.call(ADA).post('/proposals', edit('x', sha));
      expect(res.status).toBe(403);
      expect(s.github.commits).toHaveLength(0);
    });

    it('lists proposals by scope', async () => {
      const s = await setup();
      const { sha } = await pageSha(s);
      await s.call(ADA).post('/proposals', edit('# Setup\n\nImproved\n', sha));
      const mine = await s.call(ADA).get('/proposals?scope=mine');
      expect(mine.body.items).toHaveLength(1);
      expect(mine.body.items[0].description).toBeUndefined();
      expect(
        (await s.call(BOB).get('/proposals?scope=mine')).body.items,
      ).toHaveLength(0);
      expect(
        (await s.call(ADA).get('/proposals?scope=toApprove')).body.items,
      ).toHaveLength(0);
      expect(
        (await s.call(BOB).get('/proposals?scope=toApprove')).body.items,
      ).toHaveLength(1);
      expect(
        (await s.call(BOB).get('/proposals?scope=all&status=closed')).body
          .items,
      ).toHaveLength(0);
      s.state.policy = permission =>
        permission !== 'docs-studio.proposal.approve';
      expect(
        (await s.call(BOB).get('/proposals?scope=toApprove')).body.items,
      ).toHaveLength(0);
    });
  });

  describe('approval flow', () => {
    async function proposed(config: Record<string, unknown> = {}) {
      const s = await setup(config);
      const { sha } = await pageSha(s);
      const created = await s
        .call(ADA)
        .post('/proposals', edit('# Setup\n\nImproved\n', sha));
      return { s, sha, proposal: created.body as ProposalDetail };
    }

    it('enforces four-eyes and the approve permission', async () => {
      const { s, proposal } = await proposed();
      const self = await s
        .call(ADA)
        .post(`/proposals/${proposal.id}/approve`, {});
      expect(self.status).toBe(403);

      s.state.policy = permission =>
        permission !== 'docs-studio.proposal.approve';
      const denied = await s
        .call(BOB)
        .post(`/proposals/${proposal.id}/approve`, {});
      expect(denied.status).toBe(403);
      expect(s.github.pullRequest(1).merged).toBe(false);
    });

    it('approves and merges automatically with the approved head sha', async () => {
      const { s, proposal } = await proposed();
      const res = await s
        .call(BOB)
        .post(`/proposals/${proposal.id}/approve`, { comment: 'LGTM' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('merged');
      expect(res.body.approvals).toHaveLength(1);
      expect(s.github.statuses.get(`${proposal.headSha}|${STATUS}`)).toBe(
        'success',
      );
      expect(s.github.fileAt('main', 'engineering/docs/guides/setup.md')).toBe(
        '# Setup\n\nImproved\n',
      );
      expect(s.github.deletedBranches).toContain(proposal.branch);
      const again = await s
        .call(BOB)
        .post(`/proposals/${proposal.id}/approve`, {});
      expect(again.status).toBe(409);
    });

    it('keeps the approval when the merge is refused and merges later', async () => {
      const { s, proposal } = await proposed();
      s.github.mergeBlocked = true;
      const res = await s
        .call(BOB)
        .post(`/proposals/${proposal.id}/approve`, {});
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('approved');
      expect(res.body.mergeError).toMatch(/rule/i);
      expect(res.body.permissions).toMatchObject({
        canMerge: true,
        canEdit: false,
      });
      expect(s.github.statuses.get(`${proposal.headSha}|${STATUS}`)).toBe(
        'success',
      );

      const blocked = await s.call(BOB).post(`/proposals/${proposal.id}/merge`);
      expect(blocked.status).toBe(409);

      s.github.mergeBlocked = false;
      const merged = await s.call(BOB).post(`/proposals/${proposal.id}/merge`);
      expect(merged.status).toBe(200);
      expect(merged.body.status).toBe('merged');
    });

    it('waits for the configured number of approvals for the current head', async () => {
      const { s, sha, proposal } = await proposed({
        requiredApprovals: 2,
        autoMergeOnApproval: false,
      });
      const first = await s
        .call(BOB)
        .post(`/proposals/${proposal.id}/approve`, {});
      expect(first.body.status).toBe('open');
      expect(first.body.checkState).toBe('pending');

      // A new commit makes the approval stale.
      const fresh = await pageSha(s, ADA, proposal.id);
      const commit = await s
        .call(ADA)
        .post(`/proposals/${proposal.id}/commits`, {
          content: '# Setup\n\nImproved again\n',
          baseSha: fresh.sha,
        });
      expect(commit.status).toBe(200);
      expect(commit.body.approvals).toHaveLength(0);
      expect(commit.body.headSha).not.toBe(proposal.headSha);
      expect(sha).toBeDefined();

      const second = await s
        .call(CAROL)
        .post(`/proposals/${proposal.id}/approve`, {});
      expect(second.body.status).toBe('open');
      expect(second.body.approvals).toHaveLength(1);
      const third = await s
        .call(BOB)
        .post(`/proposals/${proposal.id}/approve`, {});
      expect(third.body.status).toBe('approved');
      expect(third.body.approvals).toHaveLength(2);
      expect(s.github.statuses.get(`${third.body.headSha}|${STATUS}`)).toBe(
        'success',
      );
      const premature = await s
        .call(BOB)
        .post(`/proposals/${proposal.id}/approve`, {});
      expect(premature.status).toBe(409);
    });

    it('cannot merge before approval', async () => {
      const { s, proposal } = await proposed();
      const res = await s.call(BOB).post(`/proposals/${proposal.id}/merge`);
      expect(res.status).toBe(409);
    });

    it('requests changes, then returns to pending after a new commit', async () => {
      const { s, proposal } = await proposed();
      const noComment = await s
        .call(BOB)
        .post(`/proposals/${proposal.id}/request-changes`, {});
      expect(noComment.status).toBe(400);
      const res = await s
        .call(BOB)
        .post(`/proposals/${proposal.id}/request-changes`, {
          comment: 'Needs sources',
        });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('changes_requested');
      expect(res.body.checkState).toBe('failure');
      expect(s.github.statuses.get(`${proposal.headSha}|${STATUS}`)).toBe(
        'failure',
      );
      expect(res.body.events.at(-1)).toMatchObject({
        type: 'changes_requested',
        message: 'Needs sources',
      });

      const fresh = await pageSha(s, ADA, proposal.id);
      const next = await s.call(ADA).post(`/proposals/${proposal.id}/commits`, {
        content: '# Setup\n\nWith sources\n',
        baseSha: fresh.sha,
      });
      expect(next.body.status).toBe('open');
      expect(next.body.checkState).toBe('pending');
    });

    it('discards: authors and approvers only', async () => {
      const { s, proposal } = await proposed();
      s.state.policy = (permission, _ref, userRef) =>
        permission === 'docs-studio.proposal.create' || userRef === BOB;
      const denied = await s
        .call(CAROL)
        .post(`/proposals/${proposal.id}/discard`);
      expect(denied.status).toBe(403);
      const res = await s.call(ADA).post(`/proposals/${proposal.id}/discard`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('closed');
      expect(s.github.pullRequest(1).state).toBe('closed');
      expect(s.github.deletedBranches).toContain(proposal.branch);
    });
  });

  describe('sync', () => {
    it('detects merged PRs and new commits on GitHub', async () => {
      const s = await setup({ autoMergeOnApproval: false });
      const { sha } = await pageSha(s);
      const a = await s
        .call(ADA)
        .post('/proposals', edit('# Setup\n\nImproved\n', sha));
      await s.call(BOB).post(`/proposals/${a.body.id}/approve`, {});
      const head = s.github.push(
        a.body.branch,
        'engineering/docs/guides/setup.md',
        'edited on GitHub',
      );

      await s.runSync();
      const updated = (await s.call(ADA).get(`/proposals/${a.body.id}`)).body;
      expect(updated.status).toBe('open');
      expect(updated.headSha).toBe(head);
      expect(updated.approvals).toHaveLength(0);
      expect(updated.events.map((e: any) => e.type)).toContain('head_changed');
      expect(s.github.statuses.get(`${head}|${STATUS}`)).toBe('pending');

      s.github.closeOnGithub(1, true);
      await s.runSync();
      const merged = (await s.call(ADA).get(`/proposals/${a.body.id}`)).body;
      expect(merged.status).toBe('merged');
    });

    it('imports external pull requests that touch the docs of an entity', async () => {
      const s = await setup();
      const pr = s.github.openExternalPullRequest({
        login: 'bob',
        branch: 'bob/fix-typo',
        files: { 'security/docs/index.md': '# Security fixed\n' },
      });
      s.github.openExternalPullRequest({
        login: 'bob',
        branch: 'bob/code',
        files: { 'src/index.ts': 'x' },
      });
      s.github.openExternalPullRequest({
        login: 'mallory',
        branch: 'mallory/fork',
        files: { 'security/docs/index.md': 'x' },
        fromFork: true,
      });

      await s.runSync();
      await s.runSync();
      const list = (await s.call(ADA).get('/proposals?scope=all')).body.items;
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({
        entityRef: SECURITY,
        path: 'index.md',
        source: 'github',
        prNumber: pr.number,
        checkState: 'pending',
      });
      expect(list[0].authors[0]).toMatchObject({ userEntityRef: BOB });
      expect(s.github.statuses.get(`${pr.headSha}|${STATUS}`)).toBe('pending');
    });

    it('does not import pull requests that change files outside one documentation', async () => {
      const s = await setup();
      s.github.openExternalPullRequest({
        login: 'bob',
        branch: 'bob/both',
        files: {
          'engineering/docs/index.md': '# Home fixed\n',
          'security/docs/index.md': '# Security secret\n',
        },
      });
      s.github.openExternalPullRequest({
        login: 'bob',
        branch: 'bob/code',
        files: {
          'engineering/docs/index.md': '# Home fixed\n',
          'src/index.ts': 'x',
        },
      });
      await s.runSync();
      expect(
        (await s.call(ADA).get('/proposals?scope=all')).body.items,
      ).toHaveLength(0);
    });

    it('never shows or approves files pushed outside the documentation', async () => {
      const s = await setup({ autoMergeOnApproval: false });
      const { sha } = await pageSha(s);
      const created = await s
        .call(ADA)
        .post('/proposals', edit('# Setup\n\nImproved\n', sha));
      const head = s.github.push(
        created.body.branch,
        'security/docs/index.md',
        '# Security secret\n',
      );
      await s.runSync();

      const detail = (await s.call(BOB).get(`/proposals/${created.body.id}`))
        .body;
      expect(detail.headSha).toBe(head);
      expect(detail.files.map((f: any) => f.repoPath)).toEqual([
        'engineering/docs/guides/setup.md',
      ]);
      expect(JSON.stringify(detail)).not.toContain('Security secret');
      expect(JSON.stringify(detail)).not.toContain('security/docs');
      expect(detail.hiddenFileCount).toBe(1);
      expect(detail.permissions).toMatchObject({
        canApprove: false,
        canMerge: false,
        approveBlockedReason: 'out-of-scope',
      });
      const approve = await s
        .call(BOB)
        .post(`/proposals/${created.body.id}/approve`, {});
      expect(approve.status).toBe(409);
      expect(s.github.statuses.get(`${head}|${STATUS}`)).toBe('pending');
    });

    it('skips repositories without an app installation', async () => {
      const s = await setup();
      s.github.hasInstallation = false;
      s.github.openExternalPullRequest({
        login: 'bob',
        branch: 'bob/fix',
        files: { 'security/docs/index.md': 'x' },
      });
      await s.runSync();
      expect(
        (await s.call(ADA).get('/proposals?scope=all')).body.items,
      ).toHaveLength(0);
    });

    it('restores proposals from the pull request metadata', async () => {
      const s = await setup();
      const { sha } = await pageSha(s);
      const created = await s
        .call(ADA)
        .post('/proposals', edit('# Setup\n\nImproved\n', sha));
      // Simulate a lost database by importing the PR body into a fresh backend.
      const body = s.github.pullRequest(1).body;
      const s2 = await setup();
      s2.github.openExternalPullRequest({
        login: 'docs-studio[bot]',
        branch: created.body.branch,
        files: { 'engineering/docs/guides/setup.md': '# Setup\n\nImproved\n' },
      });
      await s2.github.updatePullRequest(
        { host: 'github.com', owner: 'acme', repo: 'playground' },
        1,
        { body },
      );
      await s2.runSync();
      const restored = await s2.call(BOB).get(`/proposals/${created.body.id}`);
      expect(restored.status).toBe(200);
      expect(restored.body).toMatchObject({
        id: created.body.id,
        source: 'docs-studio',
        path: 'guides/setup.md',
      });
      expect(restored.body.authors[0].userEntityRef).toBe(ADA);
    });

    describe('metadata in pull request bodies', () => {
      const PROPOSAL_ID = '11111111-2222-4333-8444-555555555555';
      const REPO = { host: 'github.com', owner: 'acme', repo: 'playground' };

      async function openWithMetadata(
        s: Awaited<ReturnType<typeof setup>>,
        login: string,
        overrides: Partial<ProposalMetadata> = {},
      ) {
        const pr = s.github.openExternalPullRequest({
          login,
          branch: 'docs-studio/forged',
          files: { 'engineering/docs/guides/setup.md': '# Setup\n\nForged\n' },
        });
        const metadata: ProposalMetadata = {
          v: 1,
          id: PROPOSAL_ID,
          entityRef: ENGINEERING,
          path: 'guides/setup.md',
          kind: 'edit',
          authors: [{ userEntityRef: ADA, displayName: 'Ada', licensed: true }],
          approvals: [
            {
              userEntityRef: CAROL,
              displayName: 'Carol',
              sha: pr.headSha,
              createdAt: new Date().toISOString(),
            },
          ],
          ...overrides,
        };
        await s.github.updatePullRequest(REPO, pr.number, {
          body: `Forged\n\n${encodeMetadata(metadata)}`,
        });
        return pr;
      }

      it('ignores the metadata of pull requests not opened by the app', async () => {
        const s = await setup();
        const pr = await openWithMetadata(s, 'bob');
        await s.runSync();
        const list = (await s.call(ADA).get('/proposals?scope=all')).body.items;
        expect(list).toHaveLength(1);
        expect(list[0].id).not.toBe(PROPOSAL_ID);
        expect(list[0]).toMatchObject({
          source: 'github',
          status: 'open',
          checkState: 'pending',
        });
        expect(list[0].authors[0]).toMatchObject({ userEntityRef: BOB });
        const detail = (await s.call(ADA).get(`/proposals/${list[0].id}`)).body;
        expect(detail.approvals).toHaveLength(0);
        expect(s.github.statuses.get(`${pr.headSha}|${STATUS}`)).toBe(
          'pending',
        );
      });

      it('restores app pull requests as pending unless the app approved the head', async () => {
        const s = await setup();
        const pr = await openWithMetadata(s, 'docs-studio[bot]');
        await s.runSync();
        const restored = await s.call(BOB).get(`/proposals/${PROPOSAL_ID}`);
        expect(restored.status).toBe(200);
        expect(restored.body).toMatchObject({
          source: 'docs-studio',
          status: 'open',
          checkState: 'pending',
        });
        expect(restored.body.approvals).toHaveLength(0);
        expect(s.github.statuses.get(`${pr.headSha}|${STATUS}`)).toBe(
          'pending',
        );

        const s2 = await setup({ autoMergeOnApproval: false });
        const approved = await openWithMetadata(s2, 'docs-studio[bot]');
        s2.github.statuses.set(`${approved.headSha}|${STATUS}`, 'success');
        await s2.runSync();
        const trusted = await s2.call(BOB).get(`/proposals/${PROPOSAL_ID}`);
        expect(trusted.body.status).toBe('approved');
        expect(trusted.body.approvals).toHaveLength(1);
      });

      it.each([
        ['an invalid path', { path: '../catalog-info.yaml' }],
        ['an entity that does not own the files', { entityRef: SECURITY }],
      ])('does not restore metadata with %s', async (_name, overrides) => {
        const s = await setup();
        await openWithMetadata(s, 'docs-studio[bot]', overrides);
        await s.runSync();
        expect(
          (await s.call(BOB).get(`/proposals/${PROPOSAL_ID}`)).status,
        ).toBe(404);
        const list = (await s.call(ADA).get('/proposals?scope=all')).body.items;
        expect(list).toHaveLength(1);
        expect(list[0]).toMatchObject({
          entityRef: ENGINEERING,
          path: 'guides/setup.md',
          source: 'github',
          status: 'open',
        });
      });
    });
  });
});
