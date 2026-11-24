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

import type { Root, RootContent, Table } from 'mdast';
import type {
  Handle,
  Options as ToMarkdownOptions,
} from 'mdast-util-to-markdown';
import remarkGfm from 'remark-gfm';
import remarkStringify from 'remark-stringify';
import { unified } from 'unified';
import { mkdocsHeader } from './admonition';
import type { DocsAdmonitionNode } from './toMdast';

const BODY_INDENT = '    ';

const admonitionHandler: Handle = (node, _parent, state, info) => {
  const admonition = node as unknown as DocsAdmonitionNode;
  const tracker = state.createTracker(info);

  if (admonition.variant === 'mkdocs') {
    const header = mkdocsHeader(
      admonition.marker ?? '!!!',
      admonition.kind,
      admonition.title,
    );
    if (admonition.children.length === 0) {
      return header;
    }
    tracker.shift(BODY_INDENT.length);
    const body = state.indentLines(
      state.containerFlow(admonition as never, tracker.current()),
      (line, _index, blank) => (blank ? '' : BODY_INDENT + line),
    );
    return `${header}\n${body}`;
  }

  const header = `> [!${admonition.kind.toUpperCase()}]`;
  if (admonition.children.length === 0) {
    return header;
  }
  const exit = state.enter('blockquote');
  tracker.move('> ');
  tracker.shift(2);
  const body = state.containerFlow(admonition as never, tracker.current());
  exit();
  const first = admonition.children[0];
  const separator = first.type === 'paragraph' ? '' : '\n';
  const quoted = state.indentLines(
    `${separator}${body}`,
    (line, _index, blank) => `>${blank ? '' : ' '}${line}`,
  );
  return `${header}\n${quoted}`;
};

const width = (value: string) => Array.from(value).length;

/** Pipe tables padded like the tabulate-style output found in exported docs. */
const tableHandler: Handle = (node, _parent, state, info) => {
  const table = node as Table;
  const exitTable = state.enter('table');
  const rows = table.children.map(row => {
    const exitRow = state.enter('tableRow');
    const cells = row.children.map(cell =>
      state.handle(cell, row, state, info).replace(/\r?\n/g, ' '),
    );
    exitRow();
    return cells;
  });
  exitTable();

  const columns = Math.max(...rows.map(r => r.length), 1);
  const align = table.align ?? [];
  const widths: number[] = [];
  const [header, ...body] = rows;
  for (let c = 0; c < columns; c += 1) {
    // The header gets two extra columns, as in tabulate-style exports.
    widths.push(
      Math.max(
        3,
        width(header?.[c] ?? '') + 2,
        ...body.map(r => width(r[c] ?? '')),
      ),
    );
  }

  const pad = (value: string, c: number) => {
    const gap = widths[c] - width(value);
    if (align[c] === 'right') {
      return ' '.repeat(gap) + value;
    }
    if (align[c] === 'center') {
      const left = Math.floor(gap / 2);
      return ' '.repeat(left) + value + ' '.repeat(gap - left);
    }
    return value + ' '.repeat(gap);
  };
  const line = (cells: string[]) =>
    `| ${Array.from({ length: columns }, (_v, c) =>
      pad(cells[c] ?? '', c),
    ).join(' | ')} |`;
  const delimiter = `|${widths
    .map((w, c) => {
      switch (align[c]) {
        case 'left':
          return `:${'-'.repeat(w + 1)}`;
        case 'right':
          return `${'-'.repeat(w + 1)}:`;
        case 'center':
          return `:${'-'.repeat(w)}:`;
        default:
          return '-'.repeat(w + 2);
      }
    })
    .join('|')}|`;

  return [line(header ?? []), delimiter, ...body.map(line)].join('\n');
};

const options: ToMarkdownOptions = {
  bullet: '-',
  bulletOther: '*',
  emphasis: '*',
  strong: '*',
  fence: '`',
  fences: true,
  rule: '-',
  ruleRepetition: 3,
  listItemIndent: 'one',
  incrementListMarker: true,
  setext: false,
  handlers: {
    docsAdmonition: admonitionHandler,
    table: tableHandler,
  } as ToMarkdownOptions['handlers'],
};

const stringifier = unified().use(remarkGfm).use(remarkStringify, options);

/** Serializes mdast nodes using the house Markdown style. */
export function stringifyBlocks(children: RootContent[]): string {
  const root: Root = { type: 'root', children };
  return stringifier.stringify(root);
}
