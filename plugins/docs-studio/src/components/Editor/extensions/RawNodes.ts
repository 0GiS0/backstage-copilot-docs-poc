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

import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer as reactNodeView } from '@tiptap/react';
import { RawBlockView, RawInlineView } from './RawNodeView';

const rawAttributes = () => ({
  raw: { default: '' },
  kind: { default: 'html' },
});

/** Block-level content the visual editor cannot model; round-trips verbatim. */
export const RawBlock = Node.create({
  name: 'rawBlock',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes: rawAttributes,

  parseHTML() {
    return [{ tag: 'div[data-raw-block]' }];
  },

  renderHTML({ node }) {
    return ['div', { 'data-raw-block': '' }, String(node.attrs.raw)];
  },

  addNodeView() {
    return reactNodeView(RawBlockView);
  },
});

/** Inline HTML and other inline constructs kept as an opaque string. */
export const RawInline = Node.create({
  name: 'rawInline',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes: rawAttributes,

  parseHTML() {
    return [{ tag: 'span[data-raw-inline]' }];
  },

  renderHTML({ node }) {
    return ['span', { 'data-raw-inline': '' }, String(node.attrs.raw)];
  },

  addNodeView() {
    return reactNodeView(RawInlineView, { as: 'span' });
  },
});
