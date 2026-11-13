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

import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkFrontmatter from 'remark-frontmatter';
import remarkStringify from 'remark-stringify';
import { createTwoFilesPatch } from 'diff';

describe('ESM dependencies under jest', () => {
  it('round-trips markdown with unified', () => {
    const processor = unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkFrontmatter, ['yaml'])
      .use(remarkStringify);
    const tree = processor.parse('---\ntitle: A\n---\n\n# Hi\n\n- [x] done\n');
    expect(processor.stringify(tree)).toContain('# Hi');
  });

  it('loads tiptap and builds a headless editor', () => {
    const editor = new Editor({
      extensions: [StarterKit],
      content: '<p>Hello</p>',
    });
    expect(editor.getText()).toBe('Hello');
    editor.destroy();
  });

  it('loads diff', () => {
    expect(createTwoFilesPatch('a', 'b', 'x\n', 'y\n')).toContain('+y');
  });
});
