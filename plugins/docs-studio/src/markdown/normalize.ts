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

import type { JSONContent } from './types';

type Attrs = Record<string, unknown>;

/** Attributes that matter for the Markdown output, per node type. */
const NODE_ATTRS: Record<string, string[]> = {
  heading: ['level'],
  orderedList: ['start', 'spread'],
  bulletList: ['spread'],
  taskList: ['spread'],
  listItem: ['spread'],
  taskItem: ['checked', 'spread'],
  codeBlock: ['language', 'meta'],
  image: ['src', 'alt', 'title'],
  tableCell: ['align'],
  tableHeader: ['align'],
  admonition: ['variant', 'kind', 'marker', 'title'],
  rawBlock: ['raw', 'kind'],
  rawInline: ['raw', 'kind'],
};

const MARK_ATTRS: Record<string, string[]> = {
  link: ['href', 'title'],
};

// Attributes where `null`, `undefined`, `''` and `false` mean "absent".
const EMPTY_IS_ABSENT = new Set([
  'language',
  'meta',
  'alt',
  'align',
  'spread',
  'checked',
  'marker',
]);

function pickAttrs(
  type: string,
  attrs: Attrs | undefined,
  table: Record<string, string[]>,
): Attrs | undefined {
  const names = table[type];
  if (!names || !attrs) {
    return undefined;
  }
  const out: Attrs = {};
  for (const name of names) {
    const value = attrs[name] === undefined ? null : attrs[name];
    if (
      type === 'orderedList' &&
      name === 'start' &&
      (value === 1 || value === null)
    ) {
      continue;
    }
    if (
      EMPTY_IS_ABSENT.has(name) &&
      (value === null || value === '' || value === false)
    ) {
      continue;
    }
    // An admonition title distinguishes "absent" (null) from "" (explicit).
    const keepEmpty = name === 'title' && type === 'admonition';
    if (value === null || (value === '' && !keepEmpty)) {
      continue;
    }
    out[name] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function canonMarks(marks: JSONContent['marks']) {
  return (marks ?? [])
    .map(mark => ({
      type: mark.type,
      attrs: pickAttrs(mark.type, mark.attrs, MARK_ATTRS),
    }))
    .sort((a, b) => a.type.localeCompare(b.type));
}

function canonChildren(nodes: JSONContent[] | undefined): unknown[] {
  const out: Array<Record<string, unknown>> = [];
  for (const node of nodes ?? []) {
    if (node.type === 'text') {
      if (!node.text) {
        continue;
      }
      const marks = canonMarks(node.marks);
      const prev = out[out.length - 1];
      if (
        prev &&
        prev.type === 'text' &&
        JSON.stringify(prev.marks) === JSON.stringify(marks)
      ) {
        prev.text = String(prev.text) + node.text;
      } else {
        out.push({ type: 'text', text: node.text, marks });
      }
      continue;
    }
    const content = canonChildren(node.content);
    out.push({
      type: node.type,
      attrs: pickAttrs(node.type ?? '', node.attrs, NODE_ATTRS),
      marks: canonMarks(node.marks),
      content: content.length > 0 ? content : undefined,
    });
  }
  return out;
}

/**
 * Stable string describing everything in `node` that affects its Markdown,
 * ignoring editor-only attributes (ids, widths, link targets, ...).
 */
export function canonicalKey(node: JSONContent): string {
  return JSON.stringify(canonChildren([node])[0]);
}
