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

import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { findMkdocsAdmonitions } from './admonition';

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkFrontmatter, ['yaml', 'toml']);

type Json = Record<string, unknown>;

function normalize(node: Json): Json {
  const out: Json = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === 'position' || value === null || value === undefined) {
      continue;
    }
    if (key === 'children' && Array.isArray(value)) {
      const children: Json[] = [];
      for (const child of value as Json[]) {
        const norm = normalize(child);
        const prev = children[children.length - 1];
        if (norm.type === 'text' && prev?.type === 'text') {
          prev.value = String(prev.value) + String(norm.value);
        } else {
          children.push(norm);
        }
      }
      out.children = children;
    } else if (key === 'align' && Array.isArray(value)) {
      out.align = value;
    } else {
      out[key] = value;
    }
  }
  return out;
}

/**
 * mdast tree without positions, with adjacent text merged, for structural
 * comparison. MkDocs admonitions become a placeholder paragraph plus a list of
 * (header, normalized body) pairs.
 */
export function normalizedMdast(md: string): unknown {
  const regions = findMkdocsAdmonitions(md);
  let replaced = '';
  let pos = 0;
  regions.forEach((r, i) => {
    replaced += `${md.slice(pos, r.start)}ADMONITION-PLACEHOLDER-${i}`;
    pos = r.end;
  });
  replaced += md.slice(pos);
  const tree = normalize(processor.parse(replaced) as never);
  return {
    tree,
    admonitions: regions.map(r => ({
      marker: r.marker,
      kind: r.kind,
      title: r.title,
      body: normalize(processor.parse(r.body) as never),
    })),
  };
}
