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

import { Entity, stringifyEntityRef } from '@backstage/catalog-model';
import { InputError } from '@backstage/errors';
import { posix } from 'node:path';
import { GithubGateway, RepoRef } from '../github/gateway';
import { resolveRepoLocation } from './location';
import { readDocsDir } from './mkdocs';
import { joinPath } from './paths';

export interface DocsLocation {
  entityRef: string;
  repo: RepoRef;
  defaultBranch: string;
  /** Directory of `mkdocs.yml`, relative to the repo root. */
  mkdocsDir: string;
  /** Repo path of `mkdocs.yml`, when the file exists. */
  mkdocsPath?: string;
  /** Docs dir, relative to the repo root. */
  docsDir: string;
  /** Assets dir, relative to the docs dir. */
  assetsDir: string;
}

/** Repo path of a file given its path relative to the docs dir. */
export function toRepoPath(docs: DocsLocation, relativePath: string): string {
  return joinPath(docs.docsDir, relativePath);
}

/** Path relative to the docs dir, or `undefined` when outside of it. */
export function toDocsRelativePath(
  docs: DocsLocation,
  repoPath: string,
): string | undefined {
  if (docs.docsDir === '') {
    return repoPath;
  }
  return repoPath.startsWith(`${docs.docsDir}/`)
    ? repoPath.slice(docs.docsDir.length + 1)
    : undefined;
}

interface CacheEntry {
  defaultBranch: string;
  mkdocsPath?: string;
  docsDir: string;
  expires: number;
}

/** Resolves where the docs of an entity live, caching repo lookups briefly. */
export class DocsResolver {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly gateway: GithubGateway,
    private readonly assetsDir: string,
    private readonly ttlMs = 60_000,
  ) {}

  async resolve(entity: Entity): Promise<DocsLocation> {
    const { repo, mkdocsDir } = resolveRepoLocation(entity);
    const key = `${repo.host}/${repo.owner}/${repo.repo}/${mkdocsDir}`;
    let entry = this.cache.get(key);
    if (!entry || entry.expires < Date.now()) {
      entry = await this.load(repo, mkdocsDir);
      this.cache.set(key, entry);
    }
    return {
      entityRef: stringifyEntityRef(entity),
      repo,
      defaultBranch: entry.defaultBranch,
      mkdocsDir,
      mkdocsPath: entry.mkdocsPath,
      docsDir: entry.docsDir,
      assetsDir: this.assetsDir,
    };
  }

  private async load(repo: RepoRef, mkdocsDir: string): Promise<CacheEntry> {
    const { defaultBranch } = await this.gateway.getRepository(repo);
    let mkdocsPath: string | undefined;
    let text: string | undefined;
    for (const name of ['mkdocs.yml', 'mkdocs.yaml']) {
      const candidate = joinPath(mkdocsDir, name);
      const file = await this.gateway.getFile(repo, candidate, defaultBranch);
      if (file) {
        mkdocsPath = candidate;
        text = file.bytes.toString('utf8');
        break;
      }
    }
    const docsDir = posix.normalize(joinPath(mkdocsDir, readDocsDir(text)));
    if (docsDir === '..' || docsDir.startsWith('../')) {
      throw new InputError('docs_dir points outside of the repository');
    }
    return {
      defaultBranch,
      mkdocsPath,
      docsDir: docsDir === '.' ? '' : docsDir,
      expires: Date.now() + this.ttlMs,
    };
  }
}
