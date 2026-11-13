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

import type { JSONContent } from '@tiptap/core';

export type { JSONContent };

/** Attribute that links a top-level node to its original source slice. */
export const SOURCE_ID_ATTR = 'sourceId';

/** GFM alert kinds (`> [!NOTE]`). */
export const GFM_ADMONITION_KINDS = [
  'NOTE',
  'TIP',
  'IMPORTANT',
  'WARNING',
  'CAUTION',
] as const;

/** Which Markdown syntax an admonition node was written with. */
export type AdmonitionVariant = 'gfm' | 'mkdocs';

/** MkDocs markers: `!!!` plain, `???` collapsed, `???+` expanded. */
export type MkdocsMarker = '!!!' | '???' | '???+';

export interface FrontmatterBlock {
  /** Verbatim source, delimiters included (no trailing newline). */
  raw: string;
  /** Parsed YAML, when it could be parsed. */
  data?: unknown;
}

export interface SourceBlock {
  /** Value of the `sourceId` attribute on the matching top-level node. */
  id: string;
  /** mdast node type, or `admonition` for MkDocs admonitions. */
  type: string;
  /** Offsets into `ParsedDocument.source`. */
  start: number;
  end: number;
  /** Exact original bytes of the block. */
  raw: string;
  /** Verbatim text between the previous block (or front-matter) and this block. */
  gapBefore: string;
  /** The top-level node as produced by the parser. */
  node: JSONContent;
}

export interface ParsedDocument {
  frontmatter?: FrontmatterBlock;
  doc: JSONContent;
  blocks: SourceBlock[];
  /** Verbatim text after the last block. */
  trailing: string;
  /** Line ending of the original source. */
  eol: '\n' | '\r\n';
  source: string;
}

export interface SerializeOptions {
  /** When false, every block is re-stringified, even unchanged ones. */
  preserveBlocks?: boolean;
}
