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

import type { AlignType, PhrasingContent, RootContent, Text } from 'mdast';
import type { JSONContent } from './types';

/** mdast node produced for admonitions; rendered by a custom handler. */
export interface DocsAdmonitionNode {
  type: 'docsAdmonition';
  variant: 'gfm' | 'mkdocs';
  kind: string;
  marker: string | null;
  title: string | null;
  children: RootContent[];
}

type MarkJSON = NonNullable<JSONContent['marks']>[number];

interface Leaf {
  node: JSONContent;
  marks: MarkJSON[];
}

const MARK_PRIORITY = ['link', 'bold', 'italic', 'strike'];

function markKey(mark: MarkJSON): string {
  if (mark.type === 'link') {
    return `link:${String(mark.attrs?.href ?? '')}\u0000${String(
      mark.attrs?.title ?? '',
    )}`;
  }
  return mark.type;
}

function textOf(node: JSONContent): string {
  if (node.type === 'text') {
    return node.text ?? '';
  }
  return (node.content ?? []).map(textOf).join('');
}

function leafToMdast(leaf: Leaf): PhrasingContent {
  const { node, marks } = leaf;
  switch (node.type) {
    case 'text':
      if (marks.some(m => m.type === 'code')) {
        return { type: 'inlineCode', value: node.text ?? '' };
      }
      return { type: 'text', value: node.text ?? '' };
    case 'image':
      return {
        type: 'image',
        url: String(node.attrs?.src ?? ''),
        alt: (node.attrs?.alt as string | null) ?? null,
        title: (node.attrs?.title as string | null) ?? null,
      };
    case 'hardBreak':
      return { type: 'break' };
    case 'rawInline':
      return { type: 'html', value: String(node.attrs?.raw ?? '') };
    default:
      return { type: 'text', value: textOf(node) };
  }
}

/** Moves surrounding whitespace out of emphasis-like wrappers (they would not parse). */
function wrapMark(
  mark: MarkJSON,
  children: PhrasingContent[],
): PhrasingContent[] {
  if (mark.type === 'link') {
    return [
      {
        type: 'link',
        url: String(mark.attrs?.href ?? ''),
        title: (mark.attrs?.title as string | null) ?? null,
        children: children as never,
      },
    ];
  }
  const type = (
    { bold: 'strong', italic: 'emphasis', strike: 'delete' } as const
  )[mark.type as 'bold' | 'italic' | 'strike'];
  if (!type) {
    return children;
  }

  const before: PhrasingContent[] = [];
  const after: PhrasingContent[] = [];
  const inner = [...children];
  const first = inner[0];
  if (first?.type === 'text') {
    const m = /^\s+/.exec(first.value);
    if (m) {
      before.push({ type: 'text', value: m[0] });
      first.value = first.value.slice(m[0].length);
      if (first.value === '') {
        inner.shift();
      }
    }
  }
  const last = inner[inner.length - 1];
  if (last?.type === 'text') {
    const m = /\s+$/.exec(last.value);
    if (m) {
      after.push({ type: 'text', value: m[0] });
      last.value = last.value.slice(0, last.value.length - m[0].length);
      if (last.value === '') {
        inner.pop();
      }
    }
  }
  if (inner.length === 0) {
    return [...before, ...after];
  }
  return [
    ...before,
    { type, children: inner as never } as PhrasingContent,
    ...after,
  ];
}

function buildPhrasing(leaves: Leaf[]): PhrasingContent[] {
  const out: PhrasingContent[] = [];
  let i = 0;
  while (i < leaves.length) {
    const leaf = leaves[i];
    const wrapping = leaf.marks
      .filter(m => MARK_PRIORITY.includes(m.type))
      .sort(
        (a, b) => MARK_PRIORITY.indexOf(a.type) - MARK_PRIORITY.indexOf(b.type),
      );
    if (wrapping.length === 0) {
      out.push(leafToMdast(leaf));
      i += 1;
      continue;
    }
    let best = wrapping[0];
    let bestLen = 0;
    for (const mark of wrapping) {
      const key = markKey(mark);
      let len = 0;
      while (
        i + len < leaves.length &&
        leaves[i + len].marks.some(m => markKey(m) === key)
      ) {
        len += 1;
      }
      if (len > bestLen) {
        best = mark;
        bestLen = len;
      }
    }
    const key = markKey(best);
    const group = leaves.slice(i, i + bestLen).map(l => ({
      node: l.node,
      marks: l.marks.filter(m => markKey(m) !== key),
    }));
    out.push(...wrapMark(best, buildPhrasing(group)));
    i += bestLen;
  }
  return mergeText(out);
}

function mergeText(nodes: PhrasingContent[]): PhrasingContent[] {
  const out: PhrasingContent[] = [];
  for (const node of nodes) {
    const prev = out[out.length - 1];
    if (node.type === 'text' && prev?.type === 'text') {
      (prev as Text).value += node.value;
    } else {
      out.push(node);
    }
  }
  return out;
}

function phrasingOf(nodes: JSONContent[] | undefined): PhrasingContent[] {
  const leaves: Leaf[] = (nodes ?? [])
    .filter(n => !(n.type === 'text' && !n.text))
    .map(node => ({ node, marks: node.marks ?? [] }));
  return buildPhrasing(leaves);
}

const isEmptyParagraph = (node: JSONContent) =>
  node.type === 'paragraph' && (node.content ?? []).length === 0;

function flowOf(
  nodes: JSONContent[] | undefined,
  dropEmpty: boolean,
): RootContent[] {
  const out: RootContent[] = [];
  for (const node of nodes ?? []) {
    if (dropEmpty && isEmptyParagraph(node)) {
      continue;
    }
    out.push(blockToMdast(node));
  }
  return out;
}

function listItems(node: JSONContent, task: boolean) {
  return (node.content ?? []).map(item => ({
    type: 'listItem' as const,
    spread: Boolean(item.attrs?.spread),
    ...(task ? { checked: Boolean(item.attrs?.checked) } : {}),
    children: flowOf(item.content, false) as never,
  }));
}

function cellPhrasing(cell: JSONContent): PhrasingContent[] {
  const parts: PhrasingContent[][] = (cell.content ?? [])
    .filter(p => p.type === 'paragraph')
    .map(p => phrasingOf(p.content));
  const out: PhrasingContent[] = [];
  parts.forEach((part, index) => {
    if (index > 0 && out.length > 0) {
      out.push({ type: 'text', value: ' ' });
    }
    out.push(...part);
  });
  return mergeText(out);
}

function tableToMdast(node: JSONContent): RootContent {
  const rows = node.content ?? [];
  const firstRow = rows[0]?.content ?? [];
  const align: AlignType[] = firstRow.map(cell => {
    const value = cell.attrs?.align;
    return value === 'left' || value === 'right' || value === 'center'
      ? value
      : null;
  });
  return {
    type: 'table',
    align,
    children: rows.map(row => ({
      type: 'tableRow' as const,
      children: (row.content ?? []).map(cell => ({
        type: 'tableCell' as const,
        children: cellPhrasing(cell) as never,
      })),
    })),
  };
}

export function blockToMdast(node: JSONContent): RootContent {
  switch (node.type) {
    case 'paragraph':
      return { type: 'paragraph', children: phrasingOf(node.content) };
    case 'heading': {
      const depth = Math.min(Math.max(Number(node.attrs?.level ?? 1), 1), 6);
      return {
        type: 'heading',
        depth: depth as 1 | 2 | 3 | 4 | 5 | 6,
        children: phrasingOf(node.content),
      };
    }
    case 'blockquote':
      return {
        type: 'blockquote',
        children: flowOf(node.content, true) as never,
      };
    case 'bulletList':
      return {
        type: 'list',
        ordered: false,
        spread: Boolean(node.attrs?.spread),
        children: listItems(node, false),
      };
    case 'orderedList':
      return {
        type: 'list',
        ordered: true,
        start: Number(node.attrs?.start ?? 1),
        spread: Boolean(node.attrs?.spread),
        children: listItems(node, false),
      };
    case 'taskList':
      return {
        type: 'list',
        ordered: false,
        spread: Boolean(node.attrs?.spread),
        children: listItems(node, true),
      };
    case 'codeBlock':
      return {
        type: 'code',
        lang: (node.attrs?.language as string | null) || null,
        meta: (node.attrs?.meta as string | null) || null,
        value: textOf(node),
      };
    case 'horizontalRule':
      return { type: 'thematicBreak' };
    case 'table':
      return tableToMdast(node);
    case 'admonition': {
      const admonition: DocsAdmonitionNode = {
        type: 'docsAdmonition',
        variant: node.attrs?.variant === 'mkdocs' ? 'mkdocs' : 'gfm',
        kind: String(node.attrs?.kind ?? 'NOTE'),
        marker: (node.attrs?.marker as string | null) ?? null,
        title: (node.attrs?.title as string | null) ?? null,
        children: flowOf(node.content, true),
      };
      return admonition as unknown as RootContent;
    }
    case 'rawBlock':
      return { type: 'html', value: String(node.attrs?.raw ?? '') };
    default: {
      const text = textOf(node);
      return {
        type: 'paragraph',
        children: text ? [{ type: 'text', value: text }] : [],
      };
    }
  }
}

export function topLevelToMdast(nodes: JSONContent[]): RootContent[] {
  return flowOf(nodes, true);
}
