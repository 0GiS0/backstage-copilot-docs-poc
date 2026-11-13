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

import { canonicalKey } from './normalize';
import { stringifyBlocks } from './stringify';
import { topLevelToMdast } from './toMdast';
import {
  JSONContent,
  ParsedDocument,
  SOURCE_ID_ATTR,
  SerializeOptions,
  SourceBlock,
} from './types';

interface Entry {
  node: JSONContent;
  block?: SourceBlock;
  index: number;
  /** True when the node is unchanged, so its original bytes can be reused. */
  clean: boolean;
  gap: string | null;
}

const isEmptyParagraph = (node: JSONContent) =>
  node.type === 'paragraph' && (node.content ?? []).length === 0;

function toEol(text: string, eol: '\n' | '\r\n'): string {
  return eol === '\r\n' ? text.replace(/\r?\n/g, '\r\n') : text;
}

function buildEntries(
  doc: JSONContent,
  original: ParsedDocument | undefined,
  preserve: boolean,
): Entry[] {
  const byId = new Map<
    string,
    { block: SourceBlock; index: number; key: string }
  >();
  if (original) {
    original.blocks.forEach((block, index) => {
      byId.set(block.id, { block, index, key: canonicalKey(block.node) });
    });
  }

  const seen = new Set<string>();
  const entries: Entry[] = [];
  for (const node of doc.content ?? []) {
    const id = node.attrs?.[SOURCE_ID_ATTR] as string | null | undefined;
    const match = id && !seen.has(id) ? byId.get(id) : undefined;
    if (match && id) {
      seen.add(id);
    }
    const clean = Boolean(
      preserve && match && canonicalKey(node) === match.key,
    );
    if (!clean && isEmptyParagraph(node)) {
      continue;
    }
    entries.push({
      node,
      block: preserve ? match?.block : undefined,
      index: match?.index ?? -1,
      clean,
      gap: null,
    });
  }

  entries.forEach((entry, i) => {
    if (!entry.block) {
      return;
    }
    const prev = entries[i - 1];
    if (
      i === 0
        ? entry.index === 0
        : prev?.block && entry.index === prev.index + 1
    ) {
      entry.gap = entry.block.gapBefore;
    }
  });
  return entries;
}

/**
 * Serializes a Tiptap document back to Markdown. Nodes that still match the
 * block they were parsed from are emitted from the original source, together
 * with the original separators; everything else goes through remark-stringify.
 */
export function serializeMarkdown(
  doc: JSONContent,
  original?: ParsedDocument,
  options: SerializeOptions = {},
): string {
  const preserve = Boolean(original) && options.preserveBlocks !== false;
  const eol = original?.eol ?? '\n';
  const entries = buildEntries(doc, original, preserve);

  let out = original?.frontmatter?.raw ?? '';
  const frontmatterPresent = out !== '';

  let i = 0;
  while (i < entries.length) {
    const entry = entries[i];
    let text: string;
    let end = i + 1;
    if (entry.clean && entry.block) {
      text = entry.block.raw;
    } else {
      // Consecutive dirty nodes without a preserved separator are stringified
      // together so list/paragraph joining stays correct.
      while (
        end < entries.length &&
        !entries[end].clean &&
        entries[end].gap === null
      ) {
        end += 1;
      }
      text = toEol(
        stringifyBlocks(
          topLevelToMdast(entries.slice(i, end).map(e => e.node)),
        ).replace(/\n+$/, ''),
        eol,
      );
    }

    if (text !== '' || entry.clean) {
      const defaultGap =
        out === '' && !frontmatterPresent ? '' : `${eol}${eol}`;
      out += (entry.gap ?? defaultGap) + text;
    }
    i = end;
  }

  if (original) {
    out += original.trailing;
  } else if (out !== '') {
    out += eol;
  }
  return out;
}
