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

/**
 * Converts a file path relative to the docs dir (`guide/setup.md`,
 * `guide/index.md`) into the TechDocs route path the backend resolves
 * (`guide/setup`, `guide`).
 */
export function docPathFromFilePath(filePath: string): string {
  const withoutExtension = filePath.replace(/\.md$/i, '');
  return withoutExtension.replace(/(^|\/)(index|README)$/i, '');
}

/** Lowercase, ASCII, dash-separated file name stem for a page title. */
export function slugify(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Extracts the docs-relative page path from a TechDocs reader pathname.
 * Supports the standalone reader (`/docs/<ns>/<kind>/<name>/<path>`) and the
 * entity page tab (`/catalog/<ns>/<kind>/<name>/docs/<path>`).
 */
export function docPathFromLocation(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean);
  let rest: string[] = [];
  if (segments[0] === 'docs') {
    rest = segments.slice(4);
  } else if (segments[0] === 'catalog' && segments[4] === 'docs') {
    rest = segments.slice(5);
  }
  const decoded = rest.map(part => {
    try {
      return decodeURIComponent(part);
    } catch {
      return part;
    }
  });
  const hasTrailingSlash = pathname.endsWith('/') && decoded.length > 0;
  return decoded.join('/') + (hasTrailingSlash ? '/' : '');
}

/** True when a file name is safe to propose: relative, `.md`, no traversal. */
export function isValidMarkdownPath(filePath: string): boolean {
  return (
    /\.md$/i.test(filePath) &&
    !filePath.startsWith('/') &&
    !filePath.split('/').includes('..') &&
    !filePath.endsWith('/.md') &&
    filePath !== '.md'
  );
}

export function dirname(filePath: string): string {
  const index = filePath.lastIndexOf('/');
  return index < 0 ? '' : filePath.slice(0, index);
}

function normalizeSegments(path: string): string[] {
  const out: string[] = [];
  for (const segment of path.split('/')) {
    if (segment === '' || segment === '.') {
      continue;
    }
    if (segment === '..') {
      out.pop();
    } else {
      out.push(segment);
    }
  }
  return out;
}

/** Resolves an image `src` found in a page against the page's directory. */
export function resolveAgainst(baseDir: string, src: string): string {
  const clean = src.split(/[?#]/)[0];
  let decoded = clean;
  try {
    decoded = decodeURI(clean);
  } catch {
    // keep the raw value when it is not valid percent-encoding
  }
  const base = decoded.startsWith('/') ? '' : baseDir;
  return normalizeSegments(`${base}/${decoded}`).join('/');
}

/** Relative path from directory `fromDir` to `target` (both docs-relative). */
export function relativePath(fromDir: string, target: string): string {
  const from = normalizeSegments(fromDir);
  const to = normalizeSegments(target);
  let common = 0;
  while (
    common < from.length &&
    common < to.length &&
    from[common] === to[common]
  ) {
    common++;
  }
  const up = from.slice(common).map(() => '..');
  return [...up, ...to.slice(common)].join('/');
}

/** True for sources the browser can load without going through the backend. */
export function isExternalSrc(src: string): boolean {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(src);
}
