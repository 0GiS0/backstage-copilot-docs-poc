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

import { InputError } from '@backstage/errors';
import { posix } from 'node:path';

export const ASSET_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'];

const CONTENT_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  pdf: 'application/pdf',
};

/**
 * Validates a user supplied path that must stay inside a directory and returns
 * it normalized, with no leading or trailing slash and no `.` segments.
 */
export function normalizeRelativePath(input: unknown, what = 'path'): string {
  if (typeof input !== 'string' || input.trim() === '') {
    throw new InputError(`${what} is required`);
  }
  if (input.includes('\0') || input.includes('\\') || input.startsWith('/')) {
    throw new InputError(`${what} must be a relative POSIX path`);
  }
  const segments = input.split('/').filter(s => s !== '' && s !== '.');
  if (segments.length === 0) {
    throw new InputError(`${what} is required`);
  }
  if (segments.some(s => s === '..' || s.startsWith('.'))) {
    throw new InputError(`${what} must not contain hidden or parent segments`);
  }
  return segments.join('/');
}

export function isMarkdownPath(path: string): boolean {
  return /\.md$/i.test(path);
}

/**
 * Candidate Markdown files for a TechDocs route path. An empty path is the
 * home page.
 */
export function docPathCandidates(docPath: string): string[] {
  let value = docPath.split('#')[0].split('?')[0];
  try {
    value = decodeURIComponent(value);
  } catch {
    // Keep the raw value when it is not valid percent-encoding.
  }
  value = value.replace(/^\/+|\/+$/g, '').replace(/\.html?$/i, '');
  if (value === '') {
    return ['index.md', 'README.md'];
  }
  const path = normalizeRelativePath(value, 'docPath');
  if (isMarkdownPath(path)) {
    return [path];
  }
  return [`${path}.md`, `${path}/index.md`, `${path}/README.md`];
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
}

export function contentTypeFor(path: string): string {
  return CONTENT_TYPES[extensionOf(path)] ?? 'application/octet-stream';
}

export function isImagePath(path: string): boolean {
  return ASSET_EXTENSIONS.includes(extensionOf(path));
}

/**
 * Reduces an uploaded file name to a safe, predictable name:
 * `[A-Za-z0-9._-]` only, an allowed image extension, at most 100 characters.
 */
export function sanitizeAssetFileName(fileName: unknown): string {
  if (typeof fileName !== 'string' || fileName.trim() === '') {
    throw new InputError('Asset fileName is required');
  }
  const base = fileName.split(/[\\/]/).pop() ?? '';
  const extension = extensionOf(base);
  if (!ASSET_EXTENSIONS.includes(extension)) {
    throw new InputError(
      `Asset ${base} is not allowed, use one of: ${ASSET_EXTENSIONS.join(
        ', ',
      )}`,
    );
  }
  const stem = base
    .slice(0, base.length - extension.length - 1)
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 90);
  return `${stem || 'image'}.${extension}`;
}

/** Turns an arbitrary string into a lowercase branch-name segment. */
export function slugify(value: string, maxLength = 40): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '');
  return slug || 'page';
}

/** Joins POSIX paths, dropping empty segments (so `''` is the repo root). */
export function joinPath(...parts: string[]): string {
  const joined = posix.join(...parts.filter(p => p !== ''));
  return joined === '.' ? '' : joined;
}
