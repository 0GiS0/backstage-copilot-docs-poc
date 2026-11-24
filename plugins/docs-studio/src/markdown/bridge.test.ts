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

// Node built-ins are only used by tests, which read fixtures from disk.
/* eslint-disable no-restricted-imports */
import fs from 'fs';
import path from 'path';
/* eslint-enable no-restricted-imports */
import { parseMarkdown, serializeMarkdown, JSONContent } from './index';
import { normalizedMdast } from './testUtils';

const fixture = (name: string) =>
  fs.readFileSync(path.join(__dirname, '__fixtures__', name), 'utf8');

const FIXTURES = ['constructs.md', 'mkdocs.md', 'whitespace.md'];

function collect(node: JSONContent, out: JSONContent[] = []): JSONContent[] {
  out.push(node);
  (node.content ?? []).forEach(child => collect(child, out));
  return out;
}

function findAll(doc: JSONContent, type: string) {
  return collect(doc).filter(n => n.type === type);
}

describe('markdown bridge', () => {
  describe.each(FIXTURES)('%s', name => {
    const md = fixture(name);

    it('round-trips byte for byte without edits', () => {
      const parsed = parseMarkdown(md);
      expect(serializeMarkdown(parsed.doc, parsed)).toBe(md);
    });

    it('keeps the same structure when every block is re-stringified', () => {
      const parsed = parseMarkdown(md);
      const out = serializeMarkdown(parsed.doc, parsed, {
        preserveBlocks: false,
      });
      expect(normalizedMdast(out)).toEqual(normalizedMdast(md));
    });

    it('is stable once re-stringified', () => {
      const parsed = parseMarkdown(md);
      const once = serializeMarkdown(parsed.doc, parsed, {
        preserveBlocks: false,
      });
      const reparsed = parseMarkdown(once);
      expect(
        serializeMarkdown(reparsed.doc, reparsed, { preserveBlocks: false }),
      ).toBe(once);
    });
  });

  it('round-trips CRLF and a missing final newline', () => {
    const crlf = '# T\n\n- a\n- b\n\n> [!NOTE]\n> x\n'.replace(/\n/g, '\r\n');
    const parsed = parseMarkdown(crlf);
    expect(parsed.eol).toBe('\r\n');
    expect(serializeMarkdown(parsed.doc, parsed)).toBe(crlf);

    const bare = parseMarkdown('no trailing newline');
    expect(serializeMarkdown(bare.doc, bare)).toBe('no trailing newline');
  });

  it('uses the document line ending for edited blocks', () => {
    const crlf = '# T\r\n\r\nOne\r\n';
    const parsed = parseMarkdown(crlf);
    const doc = structuredClone(parsed.doc);
    doc.content![1].content = [
      { type: 'text', text: 'Two' },
      { type: 'hardBreak' },
      { type: 'text', text: 'three' },
    ];
    expect(serializeMarkdown(doc, parsed)).toBe(
      '# T\r\n\r\nTwo\\\r\nthree\r\n',
    );
  });

  describe('schema coverage', () => {
    const parsed = parseMarkdown(fixture('constructs.md'));
    const types = new Set(collect(parsed.doc).map(n => n.type));

    it('extracts front-matter separately', () => {
      expect(
        parsed.frontmatter?.raw.startsWith('---\ntitle: Synthetic page'),
      ).toBe(true);
      expect(parsed.frontmatter?.data).toEqual({
        title: 'Synthetic page',
        tags: ['one', 'two'],
      });
      expect(JSON.stringify(parsed.doc)).not.toContain('Synthetic page');
    });

    it('maps the supported constructs to editor nodes', () => {
      [
        'paragraph',
        'heading',
        'bulletList',
        'orderedList',
        'taskList',
        'taskItem',
        'blockquote',
        'admonition',
        'codeBlock',
        'horizontalRule',
        'table',
        'tableHeader',
        'tableCell',
        'hardBreak',
        'image',
        'rawBlock',
        'rawInline',
      ].forEach(type => expect(types).toContain(type));
    });

    it('keeps link and image attributes exactly', () => {
      const link = collect(parsed.doc)
        .flatMap(n => n.marks ?? [])
        .find(m => m.type === 'link' && m.attrs?.title === 'Tip');
      expect(link?.attrs?.href).toBe('Some%20Page.md');
      const image = findAll(parsed.doc, 'image')[0];
      expect(image.attrs).toMatchObject({
        src: 'attachments/some%20image.png',
        alt: 'Diagram',
        title: 'A title',
      });
      const spaced = collect(parsed.doc)
        .flatMap(n => n.marks ?? [])
        .find(m => m.attrs?.href === 'My Doc.md');
      expect(spaced).toBeDefined();
    });

    it('stores HTML as atomic raw nodes', () => {
      const blocks = findAll(parsed.doc, 'rawBlock').map(n => n.attrs?.raw);
      expect(blocks).toContain('<details>\n<summary>Open me</summary>');
      expect(blocks).toContain('</details>');
      const inline = findAll(parsed.doc, 'rawInline').map(n => n.attrs?.raw);
      expect(inline).toContain('<mark style="background: #fff;">');
      expect(inline).toContain('</mark>');
    });

    it('degrades unsupported constructs to raw nodes', () => {
      const raws = findAll(parsed.doc, 'rawBlock').map(n => n.attrs?.raw);
      expect(raws).toContain('[^1]: The footnote text.');
      expect(raws).toContain('[r]: https://example.com "Ref"');
      const inline = findAll(parsed.doc, 'rawInline').map(n => n.attrs?.raw);
      expect(inline).toContain('[^1]');
      expect(inline).toContain('[ref link][r]');
    });

    it('keeps GFM alert kinds and table alignment', () => {
      const kinds = findAll(parsed.doc, 'admonition').map(n => n.attrs?.kind);
      expect(kinds).toEqual(['NOTE', 'WARNING', 'TIP']);
      const align = findAll(parsed.doc, 'tableHeader').map(n => n.attrs?.align);
      expect(align).toEqual(['left', 'right', 'center']);
    });

    it('keeps code block language, meta and content', () => {
      const code = findAll(parsed.doc, 'codeBlock')[0];
      expect(code.attrs).toMatchObject({
        language: 'python',
        meta: 'title="x.py"',
      });
      expect(code.content?.[0].text).toBe(
        'def f(x):\n    return x  # keep   spacing',
      );
    });
  });

  describe('MkDocs admonitions', () => {
    const md = fixture('mkdocs.md');
    const parsed = parseMarkdown(md);
    const admonitions = findAll(parsed.doc, 'admonition');

    it('records which syntax was used', () => {
      expect(admonitions.map(a => a.attrs)).toEqual([
        expect.objectContaining({
          variant: 'mkdocs',
          marker: '!!!',
          kind: 'note',
          title: 'Custom title',
        }),
        expect.objectContaining({
          marker: '???',
          kind: 'warning',
          title: null,
        }),
        expect.objectContaining({ marker: '???+', kind: 'tip', title: 'Open' }),
        expect.objectContaining({ marker: '!!!', kind: 'danger', title: '' }),
      ]);
    });

    it('parses the indented body as blocks', () => {
      const body = admonitions[0].content?.map(n => n.type);
      expect(body).toEqual(['paragraph', 'paragraph', 'codeBlock']);
      expect(admonitions[2].content?.[0].type).toBe('bulletList');
    });

    it('re-emits an edited admonition with the same syntax', () => {
      const doc = structuredClone(parsed.doc);
      const node = doc.content!.find(
        n => n.type === 'admonition' && n.attrs?.marker === '???+',
      )!;
      node.content = [
        { type: 'paragraph', content: [{ type: 'text', text: 'Changed' }] },
      ];
      const out = serializeMarkdown(doc, parsed);
      expect(out).toContain('???+ tip "Open"\n    Changed\n');
      expect(out).toContain('??? warning\n    Collapsed by default.');
    });
  });

  describe('source preservation', () => {
    const md = fixture('constructs.md');
    const parsed = parseMarkdown(md);

    it('only rewrites the edited block', () => {
      const doc = structuredClone(parsed.doc);
      const heading = doc.content!.find(
        n => n.type === 'heading' && n.attrs?.level === 3,
      )!;
      heading.content = [{ type: 'text', text: 'Third level, edited' }];
      const out = serializeMarkdown(doc, parsed);
      expect(out).toBe(
        md.replace('### Third level', '### Third level, edited'),
      );
    });

    it('survives attribute noise added by the editor', () => {
      const doc = structuredClone(parsed.doc);
      for (const n of collect(doc)) {
        if (n.type === 'heading') {
          n.attrs = { ...n.attrs, textAlign: null };
        }
        if (n.type === 'tableCell' || n.type === 'tableHeader') {
          n.attrs = { ...n.attrs, colspan: 1, rowspan: 1, colwidth: null };
        }
        for (const mark of n.marks ?? []) {
          if (mark.type === 'link') {
            mark.attrs = {
              ...mark.attrs,
              target: '_blank',
              rel: 'noopener',
              class: null,
            };
          }
        }
      }
      expect(serializeMarkdown(doc, parsed)).toBe(md);
    });

    it('keeps original spacing around inserted and removed blocks', () => {
      const doc = structuredClone(parsed.doc);
      const index = doc.content!.findIndex(n => n.type === 'horizontalRule');
      doc.content!.splice(index + 1, 0, {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Inserted *literally*' }],
      });
      const out = serializeMarkdown(doc, parsed);
      expect(out).toContain('***\n\nInserted \\*literally\\*\n\n| Name');
      expect(out.replace('Inserted \\*literally\\*\n\n', '')).toBe(md);
    });

    it('serializes a new document without an original', () => {
      const doc: JSONContent = {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 1 },
            content: [{ type: 'text', text: 'Hi' }],
          },
          {
            type: 'bulletList',
            content: [
              {
                type: 'listItem',
                content: [
                  { type: 'paragraph', content: [{ type: 'text', text: 'a' }] },
                ],
              },
              {
                type: 'listItem',
                content: [
                  { type: 'paragraph', content: [{ type: 'text', text: 'b' }] },
                ],
              },
            ],
          },
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'bold ', marks: [{ type: 'bold' }] },
              {
                type: 'text',
                text: 'link',
                marks: [
                  { type: 'bold' },
                  { type: 'link', attrs: { href: 'a b.md' } },
                ],
              },
            ],
          },
        ],
      };
      expect(serializeMarkdown(doc)).toBe(
        '# Hi\n\n- a\n- b\n\n**bold [link](<a b.md>)**\n',
      );
    });

    it('allows front-matter to be replaced', () => {
      const edited = {
        ...parsed,
        frontmatter: { raw: '---\ntitle: Edited\n---' },
      };
      expect(serializeMarkdown(parsed.doc, edited)).toBe(
        md.replace(/^---[\s\S]*?\n---/, '---\ntitle: Edited\n---'),
      );
    });
  });
});
