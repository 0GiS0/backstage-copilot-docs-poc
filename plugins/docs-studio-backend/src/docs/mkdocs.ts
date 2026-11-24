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
import {
  Document,
  isMap,
  isScalar,
  isSeq,
  parseDocument,
  YAMLMap,
  YAMLSeq,
} from 'yaml';

const DEFAULT_DOCS_DIR = 'docs';

function parse(text: string): Document {
  // Unknown tags such as `!!python/name:` only produce warnings.
  const doc = parseDocument(text);
  if (doc.errors.length > 0) {
    throw new InputError(
      `mkdocs.yml is not valid YAML: ${doc.errors[0].message}`,
    );
  }
  return doc;
}

/** Reads `docs_dir` from `mkdocs.yml`, defaulting to `docs`. */
export function readDocsDir(mkdocsYml: string | undefined): string {
  if (!mkdocsYml) {
    return DEFAULT_DOCS_DIR;
  }
  const doc = parse(mkdocsYml);
  const value = doc.get('docs_dir');
  return typeof value === 'string' && value.trim()
    ? value.trim()
    : DEFAULT_DOCS_DIR;
}

function stripSlashes(value: string): string {
  return value.replace(/^\/+|\/+$/g, '');
}

function navItemPath(item: unknown): string | undefined {
  if (isScalar(item) && typeof item.value === 'string') {
    return item.value;
  }
  if (isMap(item) && item.items.length === 1) {
    const value = item.items[0].value;
    if (isScalar(value) && typeof value.value === 'string') {
      return value.value;
    }
  }
  return undefined;
}

function collectPaths(node: unknown, out: string[]): void {
  if (isSeq(node)) {
    for (const item of node.items) {
      const path = navItemPath(item);
      if (path !== undefined) {
        out.push(path);
      } else {
        collectPaths(item, out);
      }
    }
  } else if (isMap(node)) {
    for (const pair of node.items) {
      collectPaths(pair.value, out);
    }
  }
}

/**
 * Finds the nav sequence (top level or a section) that holds the page
 * `parentPath`. `parentPath` can be a file path or a TechDocs route path.
 */
function findSection(seq: YAMLSeq, parentPath: string): YAMLSeq | undefined {
  const wanted = stripSlashes(parentPath).replace(/\.html?$/i, '');
  const matches = (path: string) => {
    const p = stripSlashes(path);
    return (
      p === wanted ||
      p === `${wanted}.md` ||
      p === `${wanted}/index.md` ||
      p === `${wanted}/README.md`
    );
  };
  const dirOfWanted = wanted.includes('/')
    ? wanted.slice(0, wanted.lastIndexOf('/'))
    : '';

  const search = (
    current: YAMLSeq,
    predicate: (path: string) => boolean,
  ): YAMLSeq | undefined => {
    for (const item of current.items) {
      const path = navItemPath(item);
      if (path !== undefined && predicate(path)) {
        return current;
      }
    }
    for (const item of current.items) {
      if (isMap(item)) {
        for (const pair of item.items) {
          if (isSeq(pair.value)) {
            const found = search(pair.value, predicate);
            if (found) {
              return found;
            }
          }
        }
      }
    }
    return undefined;
  };

  const exact = search(seq, matches);
  if (exact) {
    return exact;
  }
  // The caller may point at a directory rather than at a page.
  return search(seq, path => {
    const p = stripSlashes(path);
    const dir = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '';
    return dir !== '' && (dir === wanted || dir === dirOfWanted);
  });
}

export interface NavInsertion {
  title: string;
  /** Page path relative to the docs dir. */
  filePath: string;
  parentPath?: string;
}

/**
 * Adds a page to the `nav` of an `mkdocs.yml`, under the section that holds
 * `parentPath` or at the top level. Returns `undefined` when the file has no
 * `nav` or already lists the page, so there is nothing to change. Comments
 * and formatting are preserved.
 */
export function insertNavEntry(
  mkdocsYml: string,
  insertion: NavInsertion,
): string | undefined {
  const doc = parse(mkdocsYml);
  const nav = doc.get('nav', true);
  if (!isSeq(nav)) {
    return undefined;
  }
  const existing: string[] = [];
  collectPaths(nav, existing);
  if (existing.includes(insertion.filePath)) {
    return undefined;
  }
  const target =
    (insertion.parentPath
      ? findSection(nav, insertion.parentPath)
      : undefined) ?? nav;
  const entry: YAMLMap = doc.createNode({
    [insertion.title]: insertion.filePath,
  }) as YAMLMap;
  target.add(entry);
  return doc.toString({ lineWidth: 0 });
}
