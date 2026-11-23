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

import { Config } from '@backstage/config';
import { InputError, NotAllowedError } from '@backstage/errors';
import { GithubGateway, RepoRef } from './gateway';

const DEFAULT_HOST = 'github.com';
const ENTRY_RE = /^(?:([\w.-]+(?::\d+)?)\/)?([\w.-]+)\/([\w.-]+)$/;

/**
 * Repositories Docs Studio may read from and write to, from
 * `docsStudio.allowedRepositories`. Entries are `owner/repo` (on github.com)
 * or `host/owner/repo`, compared case-insensitively.
 */
export class RepositoryAllowlist {
  /** Returns `undefined` when the setting is absent (every repo allowed). */
  static fromConfig(config: Config): RepositoryAllowlist | undefined {
    const entries = config.getOptionalStringArray(
      'docsStudio.allowedRepositories',
    );
    return entries ? new RepositoryAllowlist(entries) : undefined;
  }

  private readonly keys: Set<string>;

  constructor(entries: string[]) {
    this.keys = new Set(
      entries.map(entry => {
        const match = ENTRY_RE.exec(entry.trim());
        if (!match) {
          throw new InputError(
            `Invalid docsStudio.allowedRepositories entry "${entry}", expected owner/repo or host/owner/repo`,
          );
        }
        const [, host = DEFAULT_HOST, owner, repo] = match;
        return key({ host, owner, repo });
      }),
    );
  }

  get size(): number {
    return this.keys.size;
  }

  isAllowed(repo: RepoRef): boolean {
    return this.keys.has(key(repo));
  }
}

function key(repo: RepoRef): string {
  return `${repo.host}/${repo.owner}/${repo.repo}`.toLowerCase();
}

/**
 * Wraps a gateway so that every call on a repository outside the allowlist is
 * refused before it reaches GitHub. A GitHub App installed on more
 * repositories than Docs Studio should manage stays limited to the list.
 */
export class RepositoryGuardGateway implements GithubGateway {
  constructor(
    private readonly inner: GithubGateway,
    private readonly allowlist: RepositoryAllowlist,
  ) {}

  private check(repo: RepoRef): void {
    if (!this.allowlist.isAllowed(repo)) {
      throw new NotAllowedError(
        `Docs Studio is not enabled for ${repo.owner}/${repo.repo}`,
      );
    }
  }

  async hasAppInstallation(repo: RepoRef) {
    return (
      this.allowlist.isAllowed(repo) && this.inner.hasAppInstallation(repo)
    );
  }

  async getAppBotLogin(repo: RepoRef) {
    this.check(repo);
    return this.inner.getAppBotLogin(repo);
  }

  async assertCanWrite(repo: RepoRef) {
    this.check(repo);
    return this.inner.assertCanWrite(repo);
  }

  async getRepository(repo: RepoRef) {
    this.check(repo);
    return this.inner.getRepository(repo);
  }

  async getBranchHead(repo: RepoRef, branch: string) {
    this.check(repo);
    return this.inner.getBranchHead(repo, branch);
  }

  async getFile(repo: RepoRef, path: string, ref: string) {
    this.check(repo);
    return this.inner.getFile(repo, path, ref);
  }

  async getGithubUserId(repo: RepoRef, login: string) {
    this.check(repo);
    return this.inner.getGithubUserId(repo, login);
  }

  async createBranch(repo: RepoRef, branch: string, sha: string) {
    this.check(repo);
    return this.inner.createBranch(repo, branch, sha);
  }

  async deleteBranch(repo: RepoRef, branch: string) {
    this.check(repo);
    return this.inner.deleteBranch(repo, branch);
  }

  async commitFiles(
    repo: RepoRef,
    options: Parameters<GithubGateway['commitFiles']>[1],
  ) {
    this.check(repo);
    return this.inner.commitFiles(repo, options);
  }

  async createPullRequest(
    repo: RepoRef,
    options: Parameters<GithubGateway['createPullRequest']>[1],
  ) {
    this.check(repo);
    return this.inner.createPullRequest(repo, options);
  }

  async updatePullRequest(
    repo: RepoRef,
    number: number,
    options: Parameters<GithubGateway['updatePullRequest']>[2],
  ) {
    this.check(repo);
    return this.inner.updatePullRequest(repo, number, options);
  }

  async getPullRequest(repo: RepoRef, number: number) {
    this.check(repo);
    return this.inner.getPullRequest(repo, number);
  }

  async listOpenPullRequests(repo: RepoRef) {
    this.check(repo);
    return this.inner.listOpenPullRequests(repo);
  }

  async listPullRequestFiles(repo: RepoRef, number: number) {
    this.check(repo);
    return this.inner.listPullRequestFiles(repo, number);
  }

  async mergePullRequest(
    repo: RepoRef,
    number: number,
    options: { sha: string },
  ) {
    this.check(repo);
    return this.inner.mergePullRequest(repo, number, options);
  }

  async setCommitStatus(
    repo: RepoRef,
    sha: string,
    options: Parameters<GithubGateway['setCommitStatus']>[2],
  ) {
    this.check(repo);
    return this.inner.setCommitStatus(repo, sha, options);
  }

  async getCommitStatusState(repo: RepoRef, sha: string, context: string) {
    this.check(repo);
    return this.inner.getCommitStatusState(repo, sha, context);
  }
}
