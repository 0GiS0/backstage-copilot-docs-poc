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
import { NotAllowedError } from '@backstage/errors';
import { GithubGateway, RepoRef } from './gateway';
import { RepositoryAllowlist, RepositoryGuardGateway } from './repositoryGuard';

const allowed: RepoRef = {
  host: 'github.com',
  owner: 'acme',
  repo: 'docs',
};
const other: RepoRef = { host: 'github.com', owner: 'acme', repo: 'payments' };

function innerGateway() {
  return {
    hasAppInstallation: jest.fn().mockResolvedValue(true),
    assertCanWrite: jest.fn().mockResolvedValue(undefined),
    getRepository: jest.fn().mockResolvedValue({ defaultBranch: 'main' }),
    createBranch: jest.fn().mockResolvedValue(undefined),
    mergePullRequest: jest.fn().mockResolvedValue({ sha: 'abc' }),
    listOpenPullRequests: jest.fn().mockResolvedValue([]),
  } as unknown as jest.Mocked<GithubGateway>;
}

describe('RepositoryAllowlist', () => {
  it('is undefined when the setting is absent', () => {
    expect(
      RepositoryAllowlist.fromConfig(new ConfigReader({})),
    ).toBeUndefined();
  });

  it('matches owner/repo on github.com and host/owner/repo, ignoring case', () => {
    const list = RepositoryAllowlist.fromConfig(
      new ConfigReader({
        docsStudio: {
          allowedRepositories: ['ACME/Docs', 'ghe.example.com/team/handbook'],
        },
      }),
    )!;
    expect(list.isAllowed(allowed)).toBe(true);
    expect(list.isAllowed(other)).toBe(false);
    expect(
      list.isAllowed({
        host: 'ghe.example.com',
        owner: 'team',
        repo: 'handbook',
      }),
    ).toBe(true);
    expect(
      list.isAllowed({ host: 'ghe.example.com', owner: 'acme', repo: 'docs' }),
    ).toBe(false);
  });

  it('rejects malformed entries at startup', () => {
    expect(() => new RepositoryAllowlist(['acme'])).toThrow(/owner\/repo/);
    expect(() => new RepositoryAllowlist(['https://github.com/a/b'])).toThrow(
      /owner\/repo/,
    );
  });
});

describe('RepositoryGuardGateway', () => {
  const list = new RepositoryAllowlist(['acme/docs']);

  it('delegates calls on allowed repositories', async () => {
    const inner = innerGateway();
    const guard = new RepositoryGuardGateway(inner, list);
    await expect(guard.getRepository(allowed)).resolves.toEqual({
      defaultBranch: 'main',
    });
    await guard.mergePullRequest(allowed, 1, { sha: 'abc' });
    expect(inner.mergePullRequest).toHaveBeenCalledWith(allowed, 1, {
      sha: 'abc',
    });
  });

  it('refuses reads and writes on other repositories before reaching GitHub', async () => {
    const inner = innerGateway();
    const guard = new RepositoryGuardGateway(inner, list);
    await expect(guard.getRepository(other)).rejects.toThrow(NotAllowedError);
    await expect(guard.assertCanWrite(other)).rejects.toThrow(
      'Docs Studio is not enabled for acme/payments',
    );
    await expect(guard.createBranch(other, 'b', 'sha')).rejects.toThrow(
      NotAllowedError,
    );
    await expect(guard.listOpenPullRequests(other)).rejects.toThrow(
      NotAllowedError,
    );
    expect(inner.getRepository).not.toHaveBeenCalled();
    expect(inner.assertCanWrite).not.toHaveBeenCalled();
    expect(inner.createBranch).not.toHaveBeenCalled();
    expect(inner.listOpenPullRequests).not.toHaveBeenCalled();
  });

  it('reports no App installation for other repositories', async () => {
    const inner = innerGateway();
    const guard = new RepositoryGuardGateway(inner, list);
    await expect(guard.hasAppInstallation(other)).resolves.toBe(false);
    await expect(guard.hasAppInstallation(allowed)).resolves.toBe(true);
    expect(inner.hasAppInstallation).toHaveBeenCalledTimes(1);
  });
});
