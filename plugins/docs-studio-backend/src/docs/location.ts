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

import { Entity } from '@backstage/catalog-model';
import { InputError } from '@backstage/errors';
import { posix } from 'node:path';
import { RepoRef } from '../github/gateway';

export const ANNOTATION_TECHDOCS_REF = 'backstage.io/techdocs-ref';
const ANNOTATION_MANAGED_BY_LOCATION = 'backstage.io/managed-by-location';

export interface RepoLocation {
  repo: RepoRef;
  /** Directory holding `mkdocs.yml`, relative to the repo root (`''` = root). */
  mkdocsDir: string;
}

interface ParsedGithubUrl {
  repo: RepoRef;
  /** Path after `<blob|tree|edit>/<branch>/`, or `''`. */
  path: string;
}

/**
 * Parses `https://github.com/<owner>/<repo>[/(blob|tree|edit)/<branch>/<path>]`.
 * Branch names that contain a slash are not supported.
 */
export function parseGithubUrl(value: string): ParsedGithubUrl {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new InputError(`Not a valid URL: ${value}`);
  }
  const segments = url.pathname
    .split('/')
    .filter(Boolean)
    .map(s => decodeURIComponent(s));
  if (segments.length < 2) {
    throw new InputError(`Not a GitHub repository URL: ${value}`);
  }
  const [owner, name, kind, , ...rest] = segments;
  const hasPath = kind === 'blob' || kind === 'tree' || kind === 'edit';
  return {
    repo: { host: url.host, owner, repo: name.replace(/\.git$/, '') },
    path: hasPath ? rest.join('/') : '',
  };
}

function stripScheme(value: string, scheme: string): string | undefined {
  return value.startsWith(`${scheme}:`)
    ? value.slice(scheme.length + 1).trim()
    : undefined;
}

/**
 * Finds the repository and the `mkdocs.yml` directory of an entity from its
 * `backstage.io/techdocs-ref` annotation:
 *
 * - `dir:<rel>` is relative to the directory of the file that
 *   `backstage.io/managed-by-location` points to.
 * - `url:https://github.com/<owner>/<repo>/tree/<branch>/<dir>` is absolute.
 */
export function resolveRepoLocation(entity: Entity): RepoLocation {
  const annotations = entity.metadata.annotations ?? {};
  const ref = annotations[ANNOTATION_TECHDOCS_REF];
  if (!ref) {
    throw new InputError('This entity has no TechDocs documentation');
  }

  const url = stripScheme(ref, 'url');
  if (url !== undefined) {
    const { repo, path } = parseGithubUrl(url);
    const mkdocsDir = /\.ya?ml$/i.test(path) ? posix.dirname(path) : path;
    return { repo, mkdocsDir: mkdocsDir === '.' ? '' : mkdocsDir };
  }

  const dir = stripScheme(ref, 'dir');
  if (dir === undefined) {
    throw new InputError(
      `Unsupported ${ANNOTATION_TECHDOCS_REF} value, expected dir: or url:`,
    );
  }
  const location = annotations[ANNOTATION_MANAGED_BY_LOCATION];
  const locationUrl = location ? stripScheme(location, 'url') : undefined;
  if (locationUrl === undefined) {
    throw new InputError(
      'Docs Studio only supports entities registered from a GitHub URL',
    );
  }
  const { repo, path } = parseGithubUrl(locationUrl);
  const baseDir = path ? posix.dirname(path) : '';
  const resolved = posix.normalize(
    posix.join(baseDir === '.' ? '' : baseDir, dir || '.'),
  );
  if (resolved === '..' || resolved.startsWith('../')) {
    throw new InputError(
      `${ANNOTATION_TECHDOCS_REF} points outside of the repository`,
    );
  }
  return { repo, mkdocsDir: resolved === '.' ? '' : resolved };
}
