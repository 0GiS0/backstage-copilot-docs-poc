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

import { Extension } from '@tiptap/core';

const SOURCE_TYPES = [
  'paragraph',
  'heading',
  'blockquote',
  'bulletList',
  'orderedList',
  'taskList',
  'codeBlock',
  'horizontalRule',
  'table',
  'admonition',
  'rawBlock',
];

const SPREAD_TYPES = [
  'bulletList',
  'orderedList',
  'taskList',
  'listItem',
  'taskItem',
];

/**
 * Attributes produced by the Markdown bridge that have no visual rendering but
 * must survive editing so unchanged blocks can be emitted byte for byte.
 */
export const BridgeAttributes = Extension.create({
  name: 'docsBridgeAttributes',

  addGlobalAttributes() {
    return [
      {
        types: SOURCE_TYPES,
        attributes: {
          sourceId: {
            default: null,
            rendered: false,
            keepOnSplit: false,
          },
        },
      },
      {
        types: SPREAD_TYPES,
        attributes: {
          spread: { default: false, rendered: false },
        },
      },
      {
        types: ['codeBlock'],
        attributes: {
          meta: { default: null, rendered: false },
        },
      },
    ];
  },
});
