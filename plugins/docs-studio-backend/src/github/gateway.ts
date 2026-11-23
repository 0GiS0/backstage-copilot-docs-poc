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

/** A GitHub repository, including the host for GitHub Enterprise. */
export interface RepoRef {
  host: string;
  owner: string;
  repo: string;
}

export interface GithubFile {
  path: string;
  /** Blob sha. */
  sha: string;
  size: number;
  bytes: Buffer;
}

export interface GithubPullRequest {
  number: number;
  url: string;
  state: 'open' | 'closed';
  merged: boolean;
  title: string;
  body: string;
  headRef: string;
  headSha: string;
  baseRef: string;
  baseSha: string;
  authorLogin?: string;
  fromFork: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GithubPullRequestFile {
  path: string;
  status: 'added' | 'modified' | 'removed';
  previousPath?: string;
}

export interface GithubPullRequestCommit {
  sha: string;
  /** Unset when GitHub cannot link the commit email to an account. */
  authorLogin?: string;
  committerLogin?: string;
}

export interface CommitIdentity {
  name: string;
  email: string;
}

export interface CommitFileChange {
  path: string;
  /** `null` deletes the file. */
  content: Buffer | null;
  /**
   * Precondition on the current blob sha at the branch tip. `null` means the
   * file must not exist. `undefined` skips the check.
   */
  expectedSha?: string | null;
}

export type CommitStatusState = 'pending' | 'success' | 'failure' | 'error';

/**
 * Everything Docs Studio needs from GitHub. The default implementation uses a
 * GitHub App through Octokit; tests and alternative setups can provide their
 * own through the gateway extension point.
 */
export interface GithubGateway {
  /** True when a GitHub App installation covers the repository. */
  hasAppInstallation(repo: RepoRef): Promise<boolean>;
  /**
   * GitHub login of the bot user of the GitHub App that serves the repository
   * (`<app-slug>[bot]`). Pull requests opened by Docs Studio have this author.
   */
  getAppBotLogin(repo: RepoRef): Promise<string>;
  /** Throws `NotAllowedError` when the repository cannot be written to. */
  assertCanWrite(repo: RepoRef): Promise<void>;
  getRepository(repo: RepoRef): Promise<{ defaultBranch: string }>;
  getBranchHead(repo: RepoRef, branch: string): Promise<string>;
  /** Returns `undefined` when the file does not exist at `ref`. */
  getFile(
    repo: RepoRef,
    path: string,
    ref: string,
  ): Promise<GithubFile | undefined>;
  /** Numeric GitHub user id, cached. `undefined` when the user is unknown. */
  getGithubUserId(repo: RepoRef, login: string): Promise<number | undefined>;
  createBranch(repo: RepoRef, branch: string, sha: string): Promise<void>;
  deleteBranch(repo: RepoRef, branch: string): Promise<void>;
  /**
   * Commits the changes to `branch`. Throws `ShaMismatchError` when a
   * precondition fails or the branch moved in the meantime.
   */
  commitFiles(
    repo: RepoRef,
    options: {
      branch: string;
      message: string;
      author: CommitIdentity;
      files: CommitFileChange[];
    },
  ): Promise<{ commitSha: string }>;
  createPullRequest(
    repo: RepoRef,
    options: { title: string; body: string; head: string; base: string },
  ): Promise<GithubPullRequest>;
  updatePullRequest(
    repo: RepoRef,
    number: number,
    options: { title?: string; body?: string; state?: 'open' | 'closed' },
  ): Promise<void>;
  getPullRequest(repo: RepoRef, number: number): Promise<GithubPullRequest>;
  listOpenPullRequests(repo: RepoRef): Promise<GithubPullRequest[]>;
  listPullRequestFiles(
    repo: RepoRef,
    number: number,
  ): Promise<GithubPullRequestFile[]>;
  /** Every commit of the pull request, oldest first. */
  listPullRequestCommits(
    repo: RepoRef,
    number: number,
  ): Promise<GithubPullRequestCommit[]>;
  /** Throws `MergeBlockedError` when GitHub refuses to merge. */
  mergePullRequest(
    repo: RepoRef,
    number: number,
    options: { sha: string },
  ): Promise<{ sha: string }>;
  setCommitStatus(
    repo: RepoRef,
    sha: string,
    options: {
      context: string;
      state: CommitStatusState;
      description: string;
      targetUrl: string;
    },
  ): Promise<void>;
  /**
   * State of the latest status of `context` that the Docs Studio GitHub App
   * itself set on `sha`, or `undefined` when it has not set one. Statuses
   * created by anyone else are ignored.
   */
  getCommitStatusState(
    repo: RepoRef,
    sha: string,
    context: string,
  ): Promise<CommitStatusState | undefined>;
}
