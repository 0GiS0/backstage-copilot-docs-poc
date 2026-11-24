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

import { createRef } from 'react';
// Node built-ins are only used by tests, which read fixtures from disk.
/* eslint-disable no-restricted-imports */
import fs from 'fs';
import path from 'path';
/* eslint-enable no-restricted-imports */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Editor } from '@tiptap/core';
import { parseMarkdown, serializeMarkdown } from '../../markdown';
import type { JSONContent } from '../../markdown';
import { DocsStudioEditor } from './DocsStudioEditor';
import type { DocsStudioEditorHandle } from './DocsStudioEditor';
import { createExtensions } from './extensions';
import { editorStrings } from './strings';

const SAMPLE = [
  '---',
  'title: Demo',
  'tags: [a, b]',
  '---',
  '',
  '# Heading',
  '',
  'Some *text* with a [link](my%20page.md "Title") and <mark>html</mark>.',
  '',
  '> [!NOTE]',
  '> Careful here.',
  '',
  '- [x] done',
  '- [ ] todo',
  '',
  '| A | B |',
  '|:--|--:|',
  '| 1 | 2 |',
  '',
  '<details>',
  '<summary>More</summary>',
  '</details>',
  '',
].join('\n');

function headless(markdown: string) {
  const parsed = parseMarkdown(markdown);
  const editor = new Editor({
    extensions: createExtensions(),
    content: parsed.doc,
  });
  return { editor, parsed };
}

describe('DocsStudioEditor', () => {
  it('renders the toolbar and returns identical markdown when untouched', () => {
    const ref = createRef<DocsStudioEditorHandle>();
    const onChange = jest.fn();
    render(
      <DocsStudioEditor
        ref={ref}
        initialMarkdown={SAMPLE}
        onChange={onChange}
        onUploadImage={async () => ({ src: 'attachments/x.png' })}
      />,
    );

    const toolbar = screen.getByRole('toolbar');
    expect(toolbar).toBeTruthy();
    for (const label of [
      editorStrings.toolbar.bold,
      editorStrings.toolbar.italic,
      editorStrings.toolbar.code,
      editorStrings.toolbar.link,
      editorStrings.toolbar.bulletList,
      editorStrings.toolbar.orderedList,
      editorStrings.toolbar.taskList,
      editorStrings.toolbar.table,
      editorStrings.toolbar.image,
      editorStrings.toolbar.admonition,
      editorStrings.toolbar.codeBlock,
      editorStrings.toolbar.undo,
      editorStrings.toolbar.redo,
    ]) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
    expect(screen.getByText(editorStrings.frontmatter.title)).toBeTruthy();

    expect(ref.current?.getMarkdown()).toBe(SAMPLE);
    expect(ref.current?.isDirty()).toBe(false);
  });

  it('switches to Markdown mode and re-parses the edited text', async () => {
    const ref = createRef<DocsStudioEditorHandle>();
    const onChange = jest.fn();
    render(
      <DocsStudioEditor
        ref={ref}
        initialMarkdown={SAMPLE}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByText(editorStrings.mode.markdown));
    const textarea = (await screen.findByLabelText(
      editorStrings.markdownTextareaLabel,
    )) as HTMLTextAreaElement;
    expect(textarea.value).toBe(SAMPLE);

    const edited = SAMPLE.replace('# Heading', '# Edited heading');
    fireEvent.change(textarea, { target: { value: edited } });
    expect(ref.current?.getMarkdown()).toBe(edited);
    expect(ref.current?.isDirty()).toBe(true);
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ markdown: edited, dirty: true }),
    );

    fireEvent.click(screen.getByText(editorStrings.mode.visual));
    await waitFor(() =>
      expect(screen.getByText('Edited heading')).toBeTruthy(),
    );
    expect(ref.current?.getMarkdown()).toBe(edited);
  });

  it('edits the front-matter and reports invalid YAML', () => {
    const ref = createRef<DocsStudioEditorHandle>();
    const onChange = jest.fn();
    render(
      <DocsStudioEditor
        ref={ref}
        initialMarkdown={SAMPLE}
        onChange={onChange}
      />,
    );

    const textarea = screen.getByLabelText(
      editorStrings.frontmatter.textareaLabel,
    ) as HTMLTextAreaElement;
    expect(textarea.value).toBe('title: Demo\ntags: [a, b]');

    fireEvent.change(textarea, {
      target: { value: 'title: Changed\ntags: [a, b]' },
    });
    expect(ref.current?.getMarkdown()).toBe(
      SAMPLE.replace('title: Demo', 'title: Changed'),
    );

    fireEvent.change(textarea, { target: { value: 'title: [unclosed' } });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ frontmatterError: expect.any(String) }),
    );
    expect(
      screen.getByText(new RegExp(editorStrings.frontmatter.invalid)),
    ).toBeTruthy();
  });

  it('does not show editing controls as enabled in read-only mode', () => {
    render(<DocsStudioEditor initialMarkdown={SAMPLE} readOnly />);
    expect(
      (screen.getByLabelText(editorStrings.toolbar.bold) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});

describe('editor schema round trip', () => {
  const fixtures = path.join(__dirname, '../../markdown/__fixtures__');

  it.each(fs.readdirSync(fixtures).filter(name => name.endsWith('.md')))(
    'keeps %s byte-identical through the Tiptap schema',
    name => {
      const markdown = fs.readFileSync(path.join(fixtures, name), 'utf8');
      const { editor, parsed } = headless(markdown);
      expect(serializeMarkdown(editor.getJSON(), parsed)).toBe(markdown);
      editor.destroy();
    },
  );

  it('keeps the whole real corpus identical when available', () => {
    const dir = process.env.DOCS_STUDIO_CORPUS_DIR;
    if (!dir) {
      return;
    }
    const walk = (d: string): string[] =>
      fs.readdirSync(d, { withFileTypes: true }).flatMap(entry => {
        const full = path.join(d, entry.name);
        if (entry.isDirectory()) {
          return walk(full);
        }
        return entry.name.endsWith('.md') ? [full] : [];
      });
    for (const file of walk(dir)) {
      const markdown = fs.readFileSync(file, 'utf8');
      const { editor, parsed } = headless(markdown);
      expect(serializeMarkdown(editor.getJSON(), parsed)).toBe(markdown);
      editor.destroy();
    }
  });

  it('only rewrites the edited block', () => {
    const { editor, parsed } = headless(SAMPLE);
    const heading = editor.getJSON().content?.find(n => n.type === 'heading');
    expect(heading).toBeDefined();
    editor.commands.setTextSelection({ from: 1, to: 1 });
    editor.commands.insertContentAt({ from: 1, to: 1 }, 'New ');
    const out = serializeMarkdown(editor.getJSON(), parsed);
    expect(out).toBe(SAMPLE.replace('# Heading', '# New Heading'));
    editor.destroy();
  });

  it('survives bold combined with inline code', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'x',
              marks: [{ type: 'bold' }, { type: 'code' }],
            },
          ],
        },
      ],
    };
    const editor = new Editor({ extensions: createExtensions(), content: doc });
    const json = editor.getJSON() as JSONContent;
    expect(json.content?.[0].content?.[0].text).toBe('x');
    editor.destroy();
  });
});
