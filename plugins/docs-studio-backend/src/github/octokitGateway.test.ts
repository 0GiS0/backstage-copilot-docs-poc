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

import { ConfigReader } from '@backstage/config';
import { ScmIntegrations } from '@backstage/integration';
import { generateKeyPairSync } from 'node:crypto';
import { OctokitGithubGateway } from './octokitGateway';

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

const REPO = { host: 'github.com', owner: 'acme', repo: 'docs' };
const AUTHOR = { name: 'Alice', email: '1+alice@users.noreply.github.com' };
const BOT_EMAIL = '777+docs-bot[bot]@users.noreply.github.com';

type Call = { method: string; path: string; headers: Headers; body?: any };

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function setup(options: { failApp?: boolean; committerConfig?: boolean } = {}) {
  const calls: Call[] = [];
  const fakeFetch = (async (input: any, init: any = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    const headers = new Headers(init.headers);
    const call: Call = {
      method: init.method ?? 'GET',
      path: decodeURIComponent(url.pathname),
      headers,
      body: init.body ? JSON.parse(init.body) : undefined,
    };
    calls.push(call);
    const route = `${call.method} ${call.path}`;
    switch (route) {
      case 'GET /app':
        return options.failApp
          ? json(401, { message: 'Bad credentials' })
          : json(200, { slug: 'docs-bot' });
      case 'GET /users/docs-bot[bot]':
        return json(200, { id: 777 });
      case 'GET /repos/acme/docs/git/ref/heads/feature':
        return json(200, { object: { sha: 'head1' } });
      case 'GET /repos/acme/docs/contents/docs/new.md':
        return json(404, { message: 'Not Found' });
      case 'GET /repos/acme/docs/git/commits/head1':
        return json(200, { tree: { sha: 'tree1' } });
      case 'POST /repos/acme/docs/git/blobs':
        return json(201, { sha: 'blob1' });
      case 'POST /repos/acme/docs/git/trees':
        return json(201, { sha: 'tree2' });
      case 'POST /repos/acme/docs/git/commits':
        return json(201, { sha: 'commit2' });
      case 'PATCH /repos/acme/docs/git/refs/heads/feature':
        return json(200, { object: { sha: 'commit2' } });
      case 'GET /repos/acme/docs/commits/head1/statuses':
        return json(200, [
          {
            context: 'docs-studio/approval',
            state: 'success',
            creator: { login: 'mallory' },
          },
          {
            context: 'docs-studio/approval',
            state: 'pending',
            creator: { login: 'docs-bot[bot]' },
          },
        ]);
      case 'GET /repos/acme/docs/pulls/7/commits':
        return json(200, [
          {
            sha: 'c1',
            author: { login: 'ada' },
            committer: { login: 'web-flow' },
          },
          { sha: 'c2', author: null, committer: { login: 'bob' } },
        ]);
      default:
        return json(500, { message: `unexpected ${route}` });
    }
  }) as typeof fetch;

  const config = new ConfigReader({
    integrations: {
      github: [
        {
          host: 'github.com',
          apps: [
            {
              appId: 4242,
              clientId: 'id',
              clientSecret: 'secret',
              webhookSecret: 'hook',
              privateKey,
            },
          ],
        },
      ],
    },
    docsStudio: options.committerConfig
      ? { committer: { name: 'Custom Bot', email: 'bot@example.com' } }
      : {},
  });
  const gateway = new OctokitGithubGateway(
    ScmIntegrations.fromConfig(config),
    { getCredentials: async () => ({ type: 'app', token: 'installation' }) },
    {
      fetch: fakeFetch,
      committer: options.committerConfig
        ? { name: 'Custom Bot', email: 'bot@example.com' }
        : undefined,
    },
  );
  const commit = () =>
    gateway.commitFiles(REPO, {
      branch: 'feature',
      message: 'Add page',
      author: AUTHOR,
      files: [
        {
          path: 'docs/new.md',
          content: Buffer.from('# New'),
          expectedSha: null,
        },
        { path: 'docs/img.png', content: Buffer.from('png') },
      ],
    });
  return { calls, commit, gateway };
}

describe('OctokitGithubGateway committer', () => {
  it('sets the App bot as committer on Git Data commits', async () => {
    const { calls, commit } = setup();

    await expect(commit()).resolves.toEqual({ commitSha: 'commit2' });

    const created = calls.find(
      c => c.method === 'POST' && c.path.endsWith('/git/commits'),
    )!;
    expect(created.body.author).toMatchObject(AUTHOR);
    expect(created.body.committer).toMatchObject({
      name: 'docs-bot[bot]',
      email: BOT_EMAIL,
    });
    expect(created.body.committer.date).toBe(created.body.author.date);
  });

  it('signs an App JWT with the app id and a bounded lifetime', async () => {
    const { calls, commit } = setup();

    await commit();

    const appCall = calls.find(c => c.path === '/app')!;
    const token = appCall.headers.get('authorization')!.replace('Bearer ', '');
    const payload = JSON.parse(
      Buffer.from(token.split('.')[1], 'base64url').toString(),
    );
    expect(payload.iss).toBe('4242');
    expect(payload.exp - payload.iat).toBe(600);
    expect(Math.abs(payload.iat - (Date.now() / 1000 - 60))).toBeLessThan(10);

    const userCall = calls.find(c => c.path === '/users/docs-bot[bot]')!;
    expect(userCall.headers.get('authorization')).toBe('token installation');
  });

  it('resolves the identity once per App', async () => {
    const { calls, commit } = setup();

    await commit();
    await commit();

    expect(calls.filter(c => c.path === '/app')).toHaveLength(1);
  });

  it('uses the configured committer without calling GitHub for it', async () => {
    const { calls, commit } = setup({ committerConfig: true });

    await commit();

    const created = calls.find(
      c => c.method === 'POST' && c.path.endsWith('/git/commits'),
    )!;
    expect(created.body.committer).toMatchObject({
      name: 'Custom Bot',
      email: 'bot@example.com',
    });
    expect(calls.some(c => c.path === '/app')).toBe(false);
  });

  it('fails before creating blobs or commits when the identity cannot be resolved', async () => {
    const { calls, commit } = setup({ failApp: true });

    await expect(commit()).rejects.toThrow(
      /Could not resolve the GitHub App identity/,
    );

    expect(calls.filter(c => c.method !== 'GET')).toEqual([]);
  });
});

describe('OctokitGithubGateway commit statuses', () => {
  it('only reads the statuses created by the App', async () => {
    const { gateway } = setup();

    await expect(gateway.getAppBotLogin(REPO)).resolves.toBe('docs-bot[bot]');
    await expect(
      gateway.getCommitStatusState(REPO, 'head1', 'docs-studio/approval'),
    ).resolves.toBe('pending');
  });
});

describe('OctokitGithubGateway pull request commits', () => {
  it('maps the GitHub accounts of the authors and committers', async () => {
    const { gateway } = setup();

    await expect(gateway.listPullRequestCommits(REPO, 7)).resolves.toEqual([
      { sha: 'c1', authorLogin: 'ada', committerLogin: 'web-flow' },
      { sha: 'c2', authorLogin: undefined, committerLogin: 'bob' },
    ]);
  });
});
