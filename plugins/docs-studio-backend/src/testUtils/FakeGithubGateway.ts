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

import { NotAllowedError, NotFoundError } from '@backstage/errors';
import { createHash } from 'node:crypto';
import { MergeBlockedError, ShaMismatchError } from '../github/errors';
import {
  CommitFileChange,
  CommitIdentity,
  CommitStatusState,
  GithubFile,
  GithubGateway,
  GithubPullRequest,
  GithubPullRequestFile,
  RepoRef,
} from '../github/gateway';

type Tree = Map<string, Buffer>;

export interface RecordedCommit {
  branch: string;
  message: string;
  author: CommitIdentity;
  paths: string[];
}

interface FakePullRequest {
  data: GithubPullRequest;
  merged: boolean;
}

function blobSha(content: Buffer): string {
  return createHash('sha1').update(content).digest('hex');
}

/** An in-memory GitHub, enough to exercise the Docs Studio flows. */
export class FakeGithubGateway implements GithubGateway {
  readonly commits: RecordedCommit[] = [];
  readonly statuses = new Map<string, CommitStatusState>();
  readonly statusLog: Array<{
    sha: string;
    state: CommitStatusState;
    targetUrl: string;
    description: string;
  }> = [];
  readonly deletedBranches: string[] = [];
  mergeBlocked = false;
  readOnly = false;
  hasInstallation = true;
  botLogin = 'docs-studio[bot]';
  /** Called once by the next write check, to interleave other requests. */
  beforeNextWriteCheck?: () => Promise<void>;
  userIds = new Map<string, number>();

  private readonly snapshots = new Map<string, Tree>();
  private readonly heads = new Map<string, string>();
  private readonly pulls = new Map<number, FakePullRequest>();
  private counter = 0;

  constructor(
    initial: Record<string, string>,
    readonly defaultBranch = 'main',
  ) {
    const tree: Tree = new Map(
      Object.entries(initial).map(([k, v]) => [k, Buffer.from(v)]),
    );
    this.setHead(defaultBranch, tree);
  }

  private setHead(branch: string, tree: Tree): string {
    this.counter += 1;
    const sha = `commit-${this.counter}`;
    this.snapshots.set(sha, tree);
    this.heads.set(branch, sha);
    return sha;
  }

  private tree(ref: string): Tree | undefined {
    return this.snapshots.get(this.heads.get(ref) ?? ref);
  }

  /** Simulates a push made directly on GitHub. */
  push(branch: string, path: string, content: string): string {
    const tree = new Map(this.tree(branch));
    tree.set(path, Buffer.from(content));
    return this.setHead(branch, tree);
  }

  /** Simulates a pull request opened by someone else on GitHub. */
  openExternalPullRequest(options: {
    login: string;
    branch: string;
    files: Record<string, string>;
    title?: string;
    body?: string;
    fromFork?: boolean;
  }): GithubPullRequest {
    const tree = new Map(this.tree(this.defaultBranch));
    for (const [path, content] of Object.entries(options.files)) {
      tree.set(path, Buffer.from(content));
    }
    this.setHead(options.branch, tree);
    return this.createPullRequestSync({
      title: options.title ?? 'Some change',
      body: options.body ?? 'Fixes a typo',
      head: options.branch,
      base: this.defaultBranch,
      login: options.login,
      fromFork: options.fromFork,
    });
  }

  pullRequest(number: number): GithubPullRequest {
    return this.refreshed(this.pulls.get(number)!);
  }

  closeOnGithub(number: number, merged = false) {
    this.pulls.get(number)!.merged = merged;
    this.pulls.get(number)!.data.state = 'closed';
  }

  fileAt(ref: string, path: string): string | undefined {
    return this.tree(ref)?.get(path)?.toString('utf8');
  }

  private refreshed(pr: FakePullRequest): GithubPullRequest {
    return {
      ...pr.data,
      merged: pr.merged,
      headSha: this.heads.get(pr.data.headRef) ?? pr.data.headSha,
    };
  }

  private createPullRequestSync(options: {
    title: string;
    body: string;
    head: string;
    base: string;
    login?: string;
    fromFork?: boolean;
  }): GithubPullRequest {
    const number = this.pulls.size + 1;
    const data: GithubPullRequest = {
      number,
      url: `https://github.com/acme/playground/pull/${number}`,
      state: 'open',
      merged: false,
      title: options.title,
      body: options.body,
      headRef: options.head,
      headSha: this.heads.get(options.head)!,
      baseRef: options.base,
      baseSha: this.heads.get(options.base)!,
      authorLogin: options.login ?? this.botLogin,
      fromFork: options.fromFork ?? false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    this.pulls.set(number, { data, merged: false });
    return this.refreshed(this.pulls.get(number)!);
  }

  // ------------------------------------------------------------ gateway

  async hasAppInstallation(): Promise<boolean> {
    return this.hasInstallation;
  }

  async getAppBotLogin(): Promise<string> {
    return this.botLogin;
  }

  async assertCanWrite(repo: RepoRef): Promise<void> {
    const hook = this.beforeNextWriteCheck;
    this.beforeNextWriteCheck = undefined;
    await hook?.();
    if (this.readOnly) {
      throw new NotAllowedError(`No GitHub App installation for ${repo.owner}`);
    }
  }

  async getRepository() {
    return { defaultBranch: this.defaultBranch };
  }

  async getBranchHead(_repo: RepoRef, branch: string): Promise<string> {
    const sha = this.heads.get(branch);
    if (!sha) {
      throw new NotFoundError(`Branch ${branch} not found`);
    }
    return sha;
  }

  async getFile(
    _repo: RepoRef,
    path: string,
    ref: string,
  ): Promise<GithubFile | undefined> {
    const content = this.tree(ref)?.get(path);
    return content
      ? { path, sha: blobSha(content), size: content.length, bytes: content }
      : undefined;
  }

  async getGithubUserId(_repo: RepoRef, login: string) {
    return this.userIds.get(login);
  }

  async createBranch(_repo: RepoRef, branch: string, sha: string) {
    this.heads.set(branch, sha);
  }

  async deleteBranch(_repo: RepoRef, branch: string) {
    this.heads.delete(branch);
    this.deletedBranches.push(branch);
  }

  async commitFiles(
    _repo: RepoRef,
    options: {
      branch: string;
      message: string;
      author: CommitIdentity;
      files: CommitFileChange[];
    },
  ) {
    const tree = new Map(this.tree(options.branch));
    for (const file of options.files) {
      const current = tree.get(file.path);
      if (file.expectedSha !== undefined) {
        const actual = current ? blobSha(current) : null;
        if (actual !== file.expectedSha) {
          throw new ShaMismatchError('sha does not match', file.path);
        }
      }
      if (file.content === null) {
        tree.delete(file.path);
      } else {
        tree.set(file.path, file.content);
      }
    }
    this.commits.push({
      branch: options.branch,
      message: options.message,
      author: options.author,
      paths: options.files.map(f => f.path),
    });
    return { commitSha: this.setHead(options.branch, tree) };
  }

  async createPullRequest(
    _repo: RepoRef,
    options: { title: string; body: string; head: string; base: string },
  ) {
    return this.createPullRequestSync(options);
  }

  async updatePullRequest(
    _repo: RepoRef,
    number: number,
    options: { title?: string; body?: string; state?: 'open' | 'closed' },
  ) {
    Object.assign(this.pulls.get(number)!.data, options);
  }

  async getPullRequest(_repo: RepoRef, number: number) {
    return this.pullRequest(number);
  }

  async listOpenPullRequests() {
    return [...this.pulls.values()]
      .filter(pr => pr.data.state === 'open')
      .map(pr => this.refreshed(pr));
  }

  async listPullRequestFiles(
    _repo: RepoRef,
    number: number,
  ): Promise<GithubPullRequestFile[]> {
    const pr = this.pullRequest(number);
    const base = this.snapshots.get(pr.baseSha) ?? new Map();
    const head = this.tree(pr.headRef) ?? new Map();
    const files: GithubPullRequestFile[] = [];
    for (const [path, content] of head) {
      const before = base.get(path);
      if (!before) {
        files.push({ path, status: 'added' });
      } else if (!before.equals(content)) {
        files.push({ path, status: 'modified' });
      }
    }
    return files;
  }

  async mergePullRequest(
    _repo: RepoRef,
    number: number,
    options: { sha: string },
  ) {
    const pr = this.pullRequest(number);
    if (this.mergeBlocked) {
      throw new MergeBlockedError('Repository rule violations found');
    }
    if (pr.headSha !== options.sha) {
      throw new MergeBlockedError('Head branch was modified');
    }
    const tree = this.tree(pr.headRef)!;
    const sha = this.setHead(this.defaultBranch, new Map(tree));
    this.pulls.get(number)!.merged = true;
    this.pulls.get(number)!.data.state = 'closed';
    return { sha };
  }

  async setCommitStatus(
    _repo: RepoRef,
    sha: string,
    options: {
      context: string;
      state: CommitStatusState;
      description: string;
      targetUrl: string;
    },
  ) {
    this.statuses.set(`${sha}|${options.context}`, options.state);
    this.statusLog.push({
      sha,
      state: options.state,
      targetUrl: options.targetUrl,
      description: options.description,
    });
  }

  async getCommitStatusState(_repo: RepoRef, sha: string, context: string) {
    return this.statuses.get(`${sha}|${context}`);
  }
}
