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

import type { Extensions } from '@tiptap/core';
import { ReactNodeViewRenderer as reactNodeView } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import type { ImageOptions } from '@tiptap/extension-image';
import {
  Table,
  TableCell,
  TableHeader,
  TableRow,
} from '@tiptap/extension-table';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { Admonition } from './Admonition';
import { BridgeAttributes } from './BridgeAttributes';
import { ImageView } from './ImageView';
import type { ImageNodeOptions } from './ImageView';
import { RawBlock, RawInline } from './RawNodes';

const alignAttribute = {
  align: {
    default: null,
    parseHTML: (element: HTMLElement) =>
      element.style.textAlign || element.getAttribute('align') || null,
    renderHTML: (attributes: Record<string, unknown>) =>
      attributes.align ? { style: `text-align: ${attributes.align}` } : {},
  },
};

const AlignedCell = TableCell.extend({
  addAttributes() {
    return { ...this.parent?.(), ...alignAttribute };
  },
});

const AlignedHeader = TableHeader.extend({
  addAttributes() {
    return { ...this.parent?.(), ...alignAttribute };
  },
});

const MarkdownImage = Image.extend<ImageOptions & ImageNodeOptions>({
  addOptions() {
    return { ...this.parent?.(), imageResolver: undefined } as ImageOptions &
      ImageNodeOptions;
  },
  addNodeView() {
    return reactNodeView(ImageView, { as: 'span' });
  },
});

/** Tiptap extensions mirroring the node schema emitted by the Markdown bridge. */
export function createExtensions(options: ImageNodeOptions = {}): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      underline: false,
      link: { openOnClick: false, autolink: false },
    }),
    BridgeAttributes,
    MarkdownImage.configure({
      inline: true,
      allowBase64: true,
      imageResolver: options.imageResolver,
    }),
    Table.configure({ resizable: false }),
    TableRow,
    AlignedHeader,
    AlignedCell,
    TaskList,
    TaskItem.configure({ nested: true }),
    Admonition,
    RawBlock,
    RawInline,
  ];
}

export { Admonition, BridgeAttributes, RawBlock, RawInline };
