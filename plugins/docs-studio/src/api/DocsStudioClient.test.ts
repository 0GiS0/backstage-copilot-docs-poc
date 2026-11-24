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

import type { FetchApi } from '@backstage/frontend-plugin-api';
import { mockApis } from '@backstage/frontend-test-utils';
import { DocsStudioClient } from './DocsStudioClient';
import { DocsStudioApiError, ProposalConflictError } from './errors';

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    json: async () => body,
  };
}

function createClient(response: ReturnType<typeof jsonResponse>) {
  const fetch = jest.fn(async (_url: string, _init?: RequestInit) => response);
  const client = new DocsStudioClient({
    discoveryApi: mockApis.discovery(),
    fetchApi: { fetch } as unknown as FetchApi,
  });
  return { client, fetch };
}

describe('DocsStudioClient', () => {
  it('builds URLs against the plugin base URL and encodes query values', async () => {
    const { client, fetch } = createClient(
      jsonResponse(200, { content: 'x', sha: 'abc' }),
    );

    await client.getPage({
      entityRef: 'component:default/my service',
      docPath: 'guide/intro',
    });

    const url = new URL(fetch.mock.calls[0][0]);
    expect(url.pathname).toMatch(/\/docs-studio\/page$/);
    expect(url.searchParams.get('entityRef')).toBe(
      'component:default/my service',
    );
    expect(url.searchParams.get('docPath')).toBe('guide/intro');
  });

  it('omits undefined query parameters when listing proposals', async () => {
    const { client, fetch } = createClient(jsonResponse(200, { items: [] }));

    const items = await client.listProposals({ scope: 'mine' });

    expect(items).toEqual([]);
    const url = new URL(fetch.mock.calls[0][0]);
    expect(url.pathname).toMatch(/\/docs-studio\/proposals$/);
    expect(url.searchParams.get('scope')).toBe('mine');
    expect(url.searchParams.has('status')).toBe(false);
  });

  it('maps a 409 to ProposalConflictError carrying the current content', async () => {
    const { client } = createClient(
      jsonResponse(409, {
        error: { name: 'ConflictError', message: 'stale' },
        currentSha: 'sha-2',
        currentContent: '# latest',
      }),
    );

    const error = await client
      .createProposal({
        entityRef: 'component:default/a',
        kind: 'edit',
        path: 'index.md',
        content: '# mine',
        baseSha: 'sha-1',
      })
      .catch(e => e);

    expect(error).toBeInstanceOf(ProposalConflictError);
    expect(error.currentSha).toBe('sha-2');
    expect(error.currentContent).toBe('# latest');
  });

  it('throws DocsStudioApiError with the backend message for other failures', async () => {
    const { client } = createClient(
      jsonResponse(403, {
        error: { name: 'NotAllowedError', message: 'nope' },
      }),
    );

    const error = await client.getProposal('p1').catch(e => e);

    expect(error).toBeInstanceOf(DocsStudioApiError);
    expect(error).not.toBeInstanceOf(ProposalConflictError);
    expect(error.status).toBe(403);
    expect(error.message).toBe('nope');
  });
});
