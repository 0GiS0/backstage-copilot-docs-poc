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

import type {
  Blockquote,
  Code,
  Heading,
  List,
  ListItem,
  Nodes,
  PhrasingContent,
  Root,
  RootContent,
  Table,
  TableCell,
} from 'mdast';
import { matchGfmAlert } from './admonition';
import type { JSONContent } from './types';

/** Raised for constructs the editor schema cannot represent. */
export class UnsupportedError extends Error {}

type Mark = { type: string; attrs?: Record<string, unknown> };

function sliceOf(node: Nodes, src: string): string {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  if (start === undefined || end === undefined) {
    throw new UnsupportedError(`Node ${node.type} has no position`);
  }
  return src.slice(start, end);
}

function inlineChildren(
  children: PhrasingContent[],
  src: string,
  marks: Mark[],
): JSONContent[] {
  const out: JSONContent[] = [];
  for (const child of children) {
    out.push(...inlineNode(child, src, marks));
  }
  return out;
}

function withMarks(node: JSONContent, marks: Mark[]): JSONContent {
  return marks.length > 0
    ? { ...node, marks: marks.map(m => ({ ...m })) }
    : node;
}

function inlineNode(
  node: PhrasingContent,
  src: string,
  marks: Mark[],
): JSONContent[] {
  switch (node.type) {
    case 'text':
      return node.value === ''
        ? []
        : [withMarks({ type: 'text', text: node.value }, marks)];
    case 'strong':
      return inlineChildren(node.children, src, [...marks, { type: 'bold' }]);
    case 'emphasis':
      return inlineChildren(node.children, src, [...marks, { type: 'italic' }]);
    case 'delete':
      return inlineChildren(node.children, src, [...marks, { type: 'strike' }]);
    case 'inlineCode':
      return [
        withMarks({ type: 'text', text: node.value }, [
          ...marks,
          { type: 'code' },
        ]),
      ];
    case 'link':
      return inlineChildren(node.children, src, [
        ...marks,
        {
          type: 'link',
          attrs: { href: node.url, title: node.title ?? null },
        },
      ]);
    case 'image':
      return [
        withMarks(
          {
            type: 'image',
            attrs: {
              src: node.url,
              alt: node.alt ?? null,
              title: node.title ?? null,
            },
          },
          marks,
        ),
      ];
    case 'break':
      return [withMarks({ type: 'hardBreak' }, marks)];
    case 'html':
      return [
        withMarks(
          { type: 'rawInline', attrs: { raw: node.value, kind: 'html' } },
          marks,
        ),
      ];
    default:
      // Reference links/images, footnote references and anything else.
      return [
        withMarks(
          {
            type: 'rawInline',
            attrs: { raw: sliceOf(node, src), kind: node.type },
          },
          marks,
        ),
      ];
  }
}

function paragraphOf(children: PhrasingContent[], src: string): JSONContent {
  const content = inlineChildren(children, src, []);
  return content.length > 0
    ? { type: 'paragraph', content }
    : { type: 'paragraph' };
}

function flowChildren(children: RootContent[], src: string): JSONContent[] {
  return children.map(child => blockNode(child, src));
}

/** Content of containers that require a leading paragraph. */
function itemContent(item: ListItem, src: string): JSONContent[] {
  const [first, ...rest] = item.children;
  if (!first) {
    return [{ type: 'paragraph' }];
  }
  if (first.type !== 'paragraph') {
    throw new UnsupportedError('List item does not start with a paragraph');
  }
  return [paragraphOf(first.children, src), ...flowChildren(rest, src)];
}

function listNode(node: List, src: string): JSONContent {
  const checkedValues = node.children.map(item => item.checked);
  const taskCount = checkedValues.filter(
    v => v !== null && v !== undefined,
  ).length;
  const spread = node.spread ? { spread: true } : {};

  if (taskCount > 0) {
    if (taskCount !== node.children.length || node.ordered) {
      throw new UnsupportedError('Mixed or ordered task list');
    }
    return {
      type: 'taskList',
      attrs: { ...spread },
      content: node.children.map(item => ({
        type: 'taskItem',
        attrs: {
          checked: item.checked === true,
          ...(item.spread ? { spread: true } : {}),
        },
        content: itemContent(item, src),
      })),
    };
  }

  const items = node.children.map(item => ({
    type: 'listItem',
    attrs: item.spread ? { spread: true } : {},
    content: itemContent(item, src),
  }));
  if (node.ordered) {
    return {
      type: 'orderedList',
      attrs: { start: node.start ?? 1, ...spread },
      content: items,
    };
  }
  return { type: 'bulletList', attrs: { ...spread }, content: items };
}

function blockquoteNode(node: Blockquote, src: string): JSONContent {
  const [first, ...rest] = node.children;
  const firstText = first?.type === 'paragraph' ? first.children[0] : undefined;
  if (first?.type === 'paragraph' && firstText?.type === 'text') {
    const alert = matchGfmAlert(firstText.value);
    if (alert) {
      const remaining: PhrasingContent[] = [...first.children];
      if (alert.rest === '') {
        remaining.shift();
      } else {
        remaining[0] = { ...firstText, value: alert.rest };
      }
      const content = [
        ...(remaining.length > 0 ? [paragraphOf(remaining, src)] : []),
        ...flowChildren(rest, src),
      ];
      return {
        type: 'admonition',
        attrs: {
          variant: 'gfm',
          kind: alert.kind,
          marker: null,
          title: null,
        },
        content: content.length > 0 ? content : [{ type: 'paragraph' }],
      };
    }
  }
  const content = flowChildren(node.children, src);
  return {
    type: 'blockquote',
    content: content.length > 0 ? content : [{ type: 'paragraph' }],
  };
}

function cellNode(
  cell: TableCell,
  src: string,
  header: boolean,
  align: string | null | undefined,
): JSONContent {
  return {
    type: header ? 'tableHeader' : 'tableCell',
    attrs: { align: align ?? null },
    content: [paragraphOf(cell.children, src)],
  };
}

function tableNode(node: Table, src: string): JSONContent {
  const align = node.align ?? [];
  return {
    type: 'table',
    content: node.children.map((row, rowIndex) => ({
      type: 'tableRow',
      content: row.children.map((cell, col) =>
        cellNode(cell, src, rowIndex === 0, align[col]),
      ),
    })),
  };
}

function codeNode(node: Code): JSONContent {
  return {
    type: 'codeBlock',
    attrs: { language: node.lang ?? null, meta: node.meta ?? null },
    content:
      node.value === '' ? undefined : [{ type: 'text', text: node.value }],
  };
}

function headingNode(node: Heading, src: string): JSONContent {
  const content = inlineChildren(node.children, src, []);
  return {
    type: 'heading',
    attrs: { level: node.depth },
    ...(content.length > 0 ? { content } : {}),
  };
}

/**
 * Converts one mdast flow node. Anything unsupported throws
 * `UnsupportedError` for top-level callers to degrade to a raw block, except
 * HTML, which is always an atomic raw node.
 */
export function blockNode(node: RootContent, src: string): JSONContent {
  switch (node.type) {
    case 'paragraph':
      return paragraphOf(node.children, src);
    case 'heading':
      return headingNode(node, src);
    case 'blockquote':
      return blockquoteNode(node, src);
    case 'list':
      return listNode(node, src);
    case 'code':
      return codeNode(node);
    case 'thematicBreak':
      return { type: 'horizontalRule' };
    case 'table':
      return tableNode(node, src);
    case 'html':
      return { type: 'rawBlock', attrs: { raw: node.value, kind: 'html' } };
    default:
      throw new UnsupportedError(`Unsupported node ${node.type}`);
  }
}

export function rawBlockNode(raw: string, kind: string): JSONContent {
  return { type: 'rawBlock', attrs: { raw, kind } };
}

/** Converts top-level (or admonition body) children, degrading to raw blocks. */
export function convertTopLevel(
  root: Root,
  src: string,
): Array<{
  node: JSONContent;
  start: number;
  end: number;
  type: string;
}> {
  const out: Array<{
    node: JSONContent;
    start: number;
    end: number;
    type: string;
  }> = [];
  for (const child of root.children) {
    const start = child.position?.start.offset;
    const end = child.position?.end.offset;
    if (start === undefined || end === undefined) {
      continue;
    }
    let node: JSONContent;
    try {
      node = blockNode(child, src);
    } catch (e) {
      if (!(e instanceof UnsupportedError)) {
        throw e;
      }
      node = rawBlockNode(src.slice(start, end), child.type);
    }
    out.push({ node, start, end, type: child.type });
  }
  return out;
}
