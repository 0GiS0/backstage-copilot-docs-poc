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

import type { Root } from 'mdast';
import type { Position } from 'unist';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { parse as parseYaml } from 'yaml';
import { findMkdocsAdmonitions, maskRegions } from './admonition';
import { convertTopLevel } from './fromMdast';
import {
  JSONContent,
  ParsedDocument,
  SOURCE_ID_ATTR,
  SourceBlock,
} from './types';

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkFrontmatter, ['yaml', 'toml']);

interface FlowItem {
  node: JSONContent;
  start: number;
  end: number;
  type: string;
}

interface Flow {
  items: FlowItem[];
  frontmatterEnd?: number;
  frontmatterType?: string;
  frontmatterValue?: string;
}

/**
 * Parses `src` into top-level flow items. MkDocs admonitions are located
 * first and masked out so the CommonMark parser never sees them; offsets stay
 * valid because masking preserves length.
 */
function parseFlow(src: string): Flow {
  const regions = findMkdocsAdmonitions(src);
  const tree = processor.parse(maskRegions(src, regions)) as Root;

  const flow: Flow = { items: [] };
  // remark-frontmatter also emits `toml` nodes, which mdast's types omit.
  const first = tree.children[0] as
    | { type: string; value: string; position?: Position }
    | undefined;
  if (first && (first.type === 'yaml' || first.type === 'toml')) {
    flow.frontmatterEnd = first.position?.end.offset;
    flow.frontmatterType = first.type;
    flow.frontmatterValue = first.value;
    tree.children.shift();
  }

  const items: FlowItem[] = convertTopLevel(tree, src);
  for (const region of regions) {
    const body = parseFlow(region.body).items.map(i => i.node);
    items.push({
      type: 'admonition',
      start: region.start,
      end: region.end,
      node: {
        type: 'admonition',
        attrs: {
          variant: 'mkdocs',
          kind: region.kind,
          marker: region.marker,
          title: region.title,
        },
        content: body.length > 0 ? body : [{ type: 'paragraph' }],
      },
    });
  }
  items.sort((a, b) => a.start - b.start);
  flow.items = items;
  return flow;
}

function detectEol(source: string): '\n' | '\r\n' {
  const crlf = (source.match(/\r\n/g) ?? []).length;
  const lf = (source.match(/\n/g) ?? []).length - crlf;
  return crlf > lf ? '\r\n' : '\n';
}

/**
 * Parses Markdown into a Tiptap document plus the bookkeeping needed to
 * serialize it back byte for byte.
 */
export function parseMarkdown(md: string): ParsedDocument {
  const flow = parseFlow(md);

  let frontmatter: ParsedDocument['frontmatter'];
  let cursor = 0;
  if (flow.frontmatterEnd !== undefined) {
    cursor = flow.frontmatterEnd;
    frontmatter = { raw: md.slice(0, cursor) };
    if (flow.frontmatterType === 'yaml') {
      try {
        frontmatter.data = parseYaml(flow.frontmatterValue ?? '');
      } catch {
        // Invalid YAML is kept verbatim; consumers can surface the error.
      }
    }
  }

  const blocks: SourceBlock[] = [];
  const content: JSONContent[] = [];
  flow.items.forEach((item, index) => {
    const id = `b${index}`;
    const node: JSONContent = {
      ...item.node,
      attrs: { ...item.node.attrs, [SOURCE_ID_ATTR]: id },
    };
    blocks.push({
      id,
      type: item.type,
      start: item.start,
      end: item.end,
      raw: md.slice(item.start, item.end),
      gapBefore: md.slice(cursor, item.start),
      node,
    });
    content.push(node);
    cursor = item.end;
  });

  return {
    frontmatter,
    doc: {
      type: 'doc',
      content: content.length > 0 ? content : [{ type: 'paragraph' }],
    },
    blocks,
    trailing: md.slice(cursor),
    eol: detectEol(md),
    source: md,
  };
}
