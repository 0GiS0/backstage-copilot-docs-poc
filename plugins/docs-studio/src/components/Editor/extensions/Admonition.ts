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

import { mergeAttributes, Node } from '@tiptap/core';
import { ReactNodeViewRenderer as reactNodeView } from '@tiptap/react';
import { AdmonitionView } from './AdmonitionView';

export const Admonition = Node.create({
  name: 'admonition',
  group: 'block',
  content: 'block+',
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      variant: { default: 'gfm' },
      kind: { default: 'NOTE' },
      marker: { default: null },
      title: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-admonition]' }];
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-admonition': String(node.attrs.kind),
      }),
      0,
    ];
  },

  addNodeView() {
    return reactNodeView(AdmonitionView);
  },
});
