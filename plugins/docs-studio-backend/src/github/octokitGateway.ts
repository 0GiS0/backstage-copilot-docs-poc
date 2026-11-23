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
import {
  DefaultGithubCredentialsProvider,
  GithubCredentialsProvider,
  ScmIntegrations,
} from '@backstage/integration';
import { Octokit } from '@octokit/rest';
import { createSign } from 'node:crypto';
import {
  CommitFileChange,
  CommitIdentity,
  CommitStatusState,
  GithubFile,
  GithubGateway,
  GithubPullRequest,
  GithubPullRequestFile,
  RepoRef,
} from './gateway';
import {
  githubMessage,
  isGithubStatus,
  mapGithubError,
  MergeBlockedError,
  ShaMismatchError,
} from './errors';

const MAX_PAGES = 10;
const FILE_STATUS: Record<string, GithubPullRequestFile['status']> = {
  added: 'added',
  removed: 'removed',
};
const USER_ID_CACHE_TTL_MS = 60 * 60 * 1000;

function base64Url(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url');
}

/** Signs a short-lived GitHub App JWT (RS256) with the App private key. */
export function createAppJwt(
  appId: number | string,
  privateKey: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): string {
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  // Backdated iat tolerates clock drift; GitHub caps the lifetime at 10 minutes.
  const payload = base64Url(
    JSON.stringify({
      iat: nowSeconds - 60,
      exp: nowSeconds + 540,
      iss: String(appId),
    }),
  );
  const signature = createSign('RSA-SHA256')
    .update(`${header}.${payload}`)
    .sign(privateKey);
  return `${header}.${payload}.${base64Url(signature)}`;
}

export type OctokitGatewayOptions = {
  /** Committer used for Git Data commits; resolved from the GitHub App if omitted. */
  committer?: { name: string; email: string };
  /** Custom fetch, mainly for tests. */
  fetch?: typeof fetch;
};

type PullRequestData = {
  number: number;
  html_url: string;
  state: string;
  merged_at?: string | null;
  title: string;
  body?: string | null;
  head: { ref: string; sha: string; repo?: { full_name: string } | null };
  base: { ref: string; sha: string; repo: { full_name: string } };
  user?: { login: string } | null;
  created_at: string;
  updated_at: string;
};

function toPullRequest(data: PullRequestData): GithubPullRequest {
  return {
    number: data.number,
    url: data.html_url,
    state: data.state === 'open' ? 'open' : 'closed',
    merged: Boolean(data.merged_at),
    title: data.title,
    body: data.body ?? '',
    headRef: data.head.ref,
    headSha: data.head.sha,
    baseRef: data.base.ref,
    baseSha: data.base.sha,
    authorLogin: data.user?.login,
    fromFork: data.head.repo?.full_name !== data.base.repo.full_name,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

/**
 * GitHub gateway backed by Octokit and the GitHub App configured in
 * `integrations.github`. Writes are refused unless the credentials for the
 * repository come from a GitHub App installation.
 */
export class OctokitGithubGateway implements GithubGateway {
  private readonly userIds = new Map<
    string,
    { id: number | undefined; expires: number }
  >();

  private readonly committers = new Map<string, Promise<CommitIdentity>>();

  private readonly botLogins = new Map<string, Promise<string>>();

  static fromConfig(
    config: Config,
    options: Pick<OctokitGatewayOptions, 'fetch'> = {},
  ): OctokitGithubGateway {
    const integrations = ScmIntegrations.fromConfig(config);
    const name = config.getOptionalString('docsStudio.committer.name');
    const email = config.getOptionalString('docsStudio.committer.email');
    if (Boolean(name) !== Boolean(email)) {
      throw new InputError('docsStudio.committer requires both name and email');
    }
    return new OctokitGithubGateway(
      integrations,
      DefaultGithubCredentialsProvider.fromIntegrations(integrations),
      { ...options, committer: name && email ? { name, email } : undefined },
    );
  }

  constructor(
    private readonly integrations: ScmIntegrations,
    private readonly credentialsProvider: GithubCredentialsProvider,
    private readonly options: OctokitGatewayOptions = {},
  ) {}

  /**
   * Identity of the GitHub App bot that serves the repository. Resolved once
   * per App and cached; a failed lookup is not cached.
   */
  async resolveCommitter(repo: RepoRef): Promise<CommitIdentity> {
    if (this.options.committer) {
      return this.options.committer;
    }
    const { key } = this.appFor(repo);
    let pending = this.committers.get(key);
    if (!pending) {
      pending = this.lookupCommitter(repo);
      this.committers.set(key, pending);
      pending.catch(() => this.committers.delete(key));
    }
    return pending;
  }

  async getAppBotLogin(repo: RepoRef): Promise<string> {
    try {
      return await this.botLoginOf(repo);
    } catch (error) {
      throw new Error(
        `Could not resolve the GitHub App login (${githubMessage(error)})`,
      );
    }
  }

  private botLoginOf(repo: RepoRef): Promise<string> {
    const { key, baseUrl, appId, privateKey } = this.appFor(repo);
    let pending = this.botLogins.get(key);
    if (!pending) {
      pending = this.lookupBotLogin(baseUrl, appId, privateKey);
      this.botLogins.set(key, pending);
      pending.catch(() => this.botLogins.delete(key));
    }
    return pending;
  }

  private appFor(repo: RepoRef) {
    const integration = this.integrations.github.byHost(repo.host);
    const owner = repo.owner.toLowerCase();
    const apps = integration?.config.apps ?? [];
    const app =
      apps.find(a =>
        a.allowedInstallationOwners?.some(o => o.toLowerCase() === owner),
      ) ?? apps.find(a => !a.allowedInstallationOwners?.length);
    if (!integration || !app) {
      throw new NotAllowedError(
        `Cannot resolve the GitHub App identity for ${repo.owner}: no matching app in integrations.github. Set docsStudio.committer to override it`,
      );
    }
    return {
      key: `${repo.host}:${app.appId}`,
      baseUrl: integration.config.apiBaseUrl,
      appId: app.appId,
      privateKey: app.privateKey,
    };
  }

  private async lookupBotLogin(
    baseUrl: string | undefined,
    appId: number,
    privateKey: string,
  ): Promise<string> {
    const appOctokit = new Octokit({
      auth: createAppJwt(appId, privateKey),
      baseUrl,
      userAgent: 'backstage-docs-studio',
      request: this.options.fetch ? { fetch: this.options.fetch } : undefined,
    });
    const { data: app } = await appOctokit.apps.getAuthenticated();
    const slug = app?.slug;
    if (!slug) {
      throw new Error('the App has no slug');
    }
    return `${slug}[bot]`;
  }

  private async lookupCommitter(repo: RepoRef): Promise<CommitIdentity> {
    try {
      const botLogin = await this.botLoginOf(repo);
      // App JWTs are only accepted by /app endpoints; the user lookup goes
      // through the installation token instead.
      const installationOctokit = await this.octokit(repo);
      const { data: bot } = await installationOctokit.users.getByUsername({
        username: botLogin,
      });
      return {
        name: botLogin,
        email: `${bot.id}+${botLogin}@users.noreply.github.com`,
      };
    } catch (error) {
      throw new Error(
        `Could not resolve the GitHub App identity used as commit committer (${githubMessage(
          error,
        )}). Set docsStudio.committer to override it`,
      );
    }
  }

  async hasAppInstallation(repo: RepoRef): Promise<boolean> {
    try {
      const credentials = await this.credentialsProvider.getCredentials({
        url: this.repoUrl(repo),
      });
      return credentials.type === 'app' && Boolean(credentials.token);
    } catch {
      return false;
    }
  }

  async assertCanWrite(repo: RepoRef): Promise<void> {
    await this.octokit(repo, true);
  }

  async getRepository(repo: RepoRef): Promise<{ defaultBranch: string }> {
    const octokit = await this.octokit(repo);
    return this.run('reading the repository', async () => {
      const { data } = await octokit.repos.get({
        owner: repo.owner,
        repo: repo.repo,
      });
      return { defaultBranch: data.default_branch };
    });
  }

  async getBranchHead(repo: RepoRef, branch: string): Promise<string> {
    const octokit = await this.octokit(repo);
    return this.run('reading the branch', async () => {
      const { data } = await octokit.git.getRef({
        owner: repo.owner,
        repo: repo.repo,
        ref: `heads/${branch}`,
      });
      return data.object.sha;
    });
  }

  async getFile(
    repo: RepoRef,
    path: string,
    ref: string,
  ): Promise<GithubFile | undefined> {
    const octokit = await this.octokit(repo);
    return this.run('reading a file', async () => {
      let data;
      try {
        ({ data } = await octokit.repos.getContent({
          owner: repo.owner,
          repo: repo.repo,
          path,
          ref,
        }));
      } catch (error) {
        if (isGithubStatus(error, 404)) {
          return undefined;
        }
        throw error;
      }
      if (Array.isArray(data) || data.type !== 'file') {
        return undefined;
      }
      let bytes: Buffer;
      if (data.content && data.encoding === 'base64') {
        bytes = Buffer.from(data.content, 'base64');
      } else {
        // Files above 1 MB are not inlined by the contents API.
        const blob = await octokit.git.getBlob({
          owner: repo.owner,
          repo: repo.repo,
          file_sha: data.sha,
        });
        bytes = Buffer.from(blob.data.content, 'base64');
      }
      return { path, sha: data.sha, size: data.size, bytes };
    });
  }

  async getGithubUserId(
    repo: RepoRef,
    login: string,
  ): Promise<number | undefined> {
    const key = `${repo.host}/${login.toLowerCase()}`;
    const cached = this.userIds.get(key);
    if (cached && cached.expires > Date.now()) {
      return cached.id;
    }
    const octokit = await this.octokit(repo);
    const id = await this.run('looking up a GitHub user', async () => {
      try {
        const { data } = await octokit.users.getByUsername({ username: login });
        return data.id;
      } catch (error) {
        if (isGithubStatus(error, 404)) {
          return undefined;
        }
        throw error;
      }
    });
    this.userIds.set(key, { id, expires: Date.now() + USER_ID_CACHE_TTL_MS });
    return id;
  }

  async createBranch(repo: RepoRef, branch: string, sha: string) {
    const octokit = await this.octokit(repo, true);
    await this.run('creating a branch', () =>
      octokit.git.createRef({
        owner: repo.owner,
        repo: repo.repo,
        ref: `refs/heads/${branch}`,
        sha,
      }),
    );
  }

  async deleteBranch(repo: RepoRef, branch: string) {
    const octokit = await this.octokit(repo, true);
    await this.run('deleting a branch', async () => {
      try {
        await octokit.git.deleteRef({
          owner: repo.owner,
          repo: repo.repo,
          ref: `heads/${branch}`,
        });
      } catch (error) {
        // Already deleted, or the ref is gone for any other reason.
        if (!isGithubStatus(error, 404) && !isGithubStatus(error, 422)) {
          throw error;
        }
      }
    });
  }

  async commitFiles(
    repo: RepoRef,
    options: {
      branch: string;
      message: string;
      author: CommitIdentity;
      files: CommitFileChange[];
    },
  ): Promise<{ commitSha: string }> {
    const octokit = await this.octokit(repo, true);
    const { files } = options;
    if (files.length === 0) {
      throw new InputError('There is nothing to commit');
    }
    const single = files.length === 1 ? files[0] : undefined;
    if (single && single.content && typeof single.expectedSha === 'string') {
      return this.updateSingleFile(octokit, repo, options, single);
    }
    return this.commitWithGitData(octokit, repo, options);
  }

  private async updateSingleFile(
    octokit: Octokit,
    repo: RepoRef,
    options: { branch: string; message: string; author: CommitIdentity },
    file: CommitFileChange,
  ): Promise<{ commitSha: string }> {
    return this.run('committing a file', async () => {
      try {
        const { data } = await octokit.repos.createOrUpdateFileContents({
          owner: repo.owner,
          repo: repo.repo,
          path: file.path,
          message: options.message,
          content: file.content!.toString('base64'),
          sha: file.expectedSha as string,
          branch: options.branch,
          // Committer is intentionally omitted: GitHub defaults it to the
          // authenticated App and signs the commit on its behalf.
          author: options.author,
        });
        return { commitSha: data.commit.sha! };
      } catch (error) {
        throw this.mapCommitError(error, file.path);
      }
    });
  }

  private async commitWithGitData(
    octokit: Octokit,
    repo: RepoRef,
    options: {
      branch: string;
      message: string;
      author: CommitIdentity;
      files: CommitFileChange[];
    },
  ): Promise<{ commitSha: string }> {
    // Resolve first so a failure never leaves blobs or commits behind.
    const committer = await this.resolveCommitter(repo);
    return this.run('committing files', async () => {
      const base = { owner: repo.owner, repo: repo.repo };
      const headSha = await this.getBranchHead(repo, options.branch);

      for (const file of options.files) {
        if (file.expectedSha === undefined) {
          continue;
        }
        const current = await this.getFile(repo, file.path, options.branch);
        if ((current?.sha ?? null) !== file.expectedSha) {
          throw new ShaMismatchError(
            `${file.path} changed on GitHub since it was loaded`,
            file.path,
          );
        }
      }

      const headCommit = await octokit.git.getCommit({
        ...base,
        commit_sha: headSha,
      });
      const tree = [];
      for (const file of options.files) {
        if (file.content === null) {
          tree.push({
            path: file.path,
            mode: '100644' as const,
            type: 'blob' as const,
            sha: null,
          });
          continue;
        }
        const blob = await octokit.git.createBlob({
          ...base,
          content: file.content.toString('base64'),
          encoding: 'base64',
        });
        tree.push({
          path: file.path,
          mode: '100644' as const,
          type: 'blob' as const,
          sha: blob.data.sha,
        });
      }
      const newTree = await octokit.git.createTree({
        ...base,
        base_tree: headCommit.data.tree.sha,
        tree,
      });
      const date = new Date().toISOString();
      const commit = await octokit.git.createCommit({
        ...base,
        message: options.message,
        tree: newTree.data.sha,
        parents: [headSha],
        // The Git Data API defaults the committer to the author, so it is set
        // explicitly. (The Contents API already defaults it to the App.)
        author: { ...options.author, date },
        committer: { ...committer, date },
      });
      try {
        await octokit.git.updateRef({
          ...base,
          ref: `heads/${options.branch}`,
          sha: commit.data.sha,
          force: false,
        });
      } catch (error) {
        throw this.mapCommitError(error);
      }
      return { commitSha: commit.data.sha };
    });
  }

  private mapCommitError(error: unknown, path?: string): unknown {
    const detail = githubMessage(error);
    if (
      isGithubStatus(error, 409) ||
      (isGithubStatus(error, 422) &&
        /does not match|not a fast forward|fast.forward/i.test(detail))
    ) {
      return new ShaMismatchError(
        'The page changed on GitHub since it was loaded',
        path,
      );
    }
    return error;
  }

  async createPullRequest(
    repo: RepoRef,
    options: { title: string; body: string; head: string; base: string },
  ): Promise<GithubPullRequest> {
    const octokit = await this.octokit(repo, true);
    return this.run('opening a pull request', async () => {
      const { data } = await octokit.pulls.create({
        owner: repo.owner,
        repo: repo.repo,
        ...options,
      });
      return toPullRequest(data as PullRequestData);
    });
  }

  async updatePullRequest(
    repo: RepoRef,
    number: number,
    options: { title?: string; body?: string; state?: 'open' | 'closed' },
  ) {
    const octokit = await this.octokit(repo, true);
    await this.run('updating a pull request', () =>
      octokit.pulls.update({
        owner: repo.owner,
        repo: repo.repo,
        pull_number: number,
        ...options,
      }),
    );
  }

  async getPullRequest(
    repo: RepoRef,
    number: number,
  ): Promise<GithubPullRequest> {
    const octokit = await this.octokit(repo);
    return this.run('reading a pull request', async () => {
      const { data } = await octokit.pulls.get({
        owner: repo.owner,
        repo: repo.repo,
        pull_number: number,
      });
      return toPullRequest(data as PullRequestData);
    });
  }

  async listOpenPullRequests(repo: RepoRef): Promise<GithubPullRequest[]> {
    const octokit = await this.octokit(repo);
    return this.run('listing pull requests', async () => {
      const result: GithubPullRequest[] = [];
      for (let page = 1; page <= MAX_PAGES; page++) {
        const { data } = await octokit.pulls.list({
          owner: repo.owner,
          repo: repo.repo,
          state: 'open',
          per_page: 100,
          page,
        });
        result.push(...data.map(pr => toPullRequest(pr as PullRequestData)));
        if (data.length < 100) {
          break;
        }
      }
      return result;
    });
  }

  async listPullRequestFiles(
    repo: RepoRef,
    number: number,
  ): Promise<GithubPullRequestFile[]> {
    const octokit = await this.octokit(repo);
    return this.run('listing pull request files', async () => {
      const result: GithubPullRequestFile[] = [];
      for (let page = 1; page <= MAX_PAGES; page++) {
        const { data } = await octokit.pulls.listFiles({
          owner: repo.owner,
          repo: repo.repo,
          pull_number: number,
          per_page: 100,
          page,
        });
        for (const file of data) {
          result.push({
            path: file.filename,
            status: FILE_STATUS[file.status] ?? 'modified',
            previousPath: file.previous_filename,
          });
        }
        if (data.length < 100) {
          return result;
        }
      }
      // Callers check that every changed file is in scope: never truncate.
      throw new Error('The pull request changes too many files to be checked');
    });
  }

  async mergePullRequest(
    repo: RepoRef,
    number: number,
    options: { sha: string },
  ): Promise<{ sha: string }> {
    const octokit = await this.octokit(repo, true);
    return this.run('merging a pull request', async () => {
      try {
        const { data } = await octokit.pulls.merge({
          owner: repo.owner,
          repo: repo.repo,
          pull_number: number,
          merge_method: 'merge',
          sha: options.sha,
        });
        return { sha: data.sha };
      } catch (error) {
        if (
          isGithubStatus(error, 405) ||
          isGithubStatus(error, 409) ||
          isGithubStatus(error, 422)
        ) {
          throw new MergeBlockedError(githubMessage(error));
        }
        throw error;
      }
    });
  }

  async setCommitStatus(
    repo: RepoRef,
    sha: string,
    options: {
      context: string;
      state: CommitStatusState;
      description: string;
      targetUrl: string;
    },
  ) {
    const octokit = await this.octokit(repo, true);
    await this.run('setting the commit status', () =>
      octokit.repos.createCommitStatus({
        owner: repo.owner,
        repo: repo.repo,
        sha,
        state: options.state,
        context: options.context,
        description: options.description.slice(0, 140),
        target_url: options.targetUrl,
      }),
    );
  }

  async getCommitStatusState(
    repo: RepoRef,
    sha: string,
    context: string,
  ): Promise<CommitStatusState | undefined> {
    const botLogin = (await this.getAppBotLogin(repo)).toLowerCase();
    const octokit = await this.octokit(repo);
    return this.run('reading the commit status', async () => {
      // Newest first. Only the App's own statuses count: anyone with write
      // access can create a status with the same context.
      for (let page = 1; page <= MAX_PAGES; page++) {
        const { data } = await octokit.repos.listCommitStatusesForRef({
          owner: repo.owner,
          repo: repo.repo,
          ref: sha,
          per_page: 100,
          page,
        });
        const own = data.find(
          s =>
            s.context === context &&
            s.creator?.login?.toLowerCase() === botLogin,
        );
        if (own) {
          return own.state as CommitStatusState;
        }
        if (data.length < 100) {
          break;
        }
      }
      return undefined;
    });
  }

  private repoUrl(repo: RepoRef): string {
    return `https://${repo.host}/${repo.owner}/${repo.repo}`;
  }

  private async octokit(repo: RepoRef, write = false): Promise<Octokit> {
    const integration = this.integrations.github.byHost(repo.host);
    if (!integration) {
      throw new InputError(
        `There is no GitHub integration configured for ${repo.host}`,
      );
    }
    const credentials = await this.credentialsProvider.getCredentials({
      url: this.repoUrl(repo),
    });
    if (!credentials.token) {
      throw new NotAllowedError(
        `Docs Studio has no GitHub credentials for ${repo.owner}`,
      );
    }
    if (write && credentials.type !== 'app') {
      throw new NotAllowedError(
        `Docs Studio requires a GitHub App installation for ${repo.owner}`,
      );
    }
    return new Octokit({
      auth: credentials.token,
      baseUrl: integration.config.apiBaseUrl,
      userAgent: 'backstage-docs-studio',
      request: this.options.fetch ? { fetch: this.options.fetch } : undefined,
    });
  }

  private async run<T>(action: string, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (
        error instanceof ShaMismatchError ||
        error instanceof MergeBlockedError
      ) {
        throw error;
      }
      throw mapGithubError(error, action);
    }
  }
}
