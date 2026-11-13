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

import { diffLines } from 'diff';
// Node built-ins are only used by tests, which read fixtures from disk.
/* eslint-disable no-restricted-imports */
import fs from 'fs';
import path from 'path';
/* eslint-enable no-restricted-imports */
import { JSONContent, parseMarkdown, serializeMarkdown } from './index';
import { normalizedMdast } from './testUtils';

const corpusDir = process.env.DOCS_STUDIO_CORPUS_DIR;
const reportPath = process.env.DOCS_STUDIO_FIDELITY_REPORT;
const maybeDescribe = corpusDir ? describe : describe.skip;

function listMarkdown(dir: string): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap(entry => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return listMarkdown(full);
      }
      return entry.name.endsWith('.md') ? [full] : [];
    })
    .sort();
}

/** Text of the first paragraph that has plain text, used for the edit test. */
function findEditableParagraph(doc: JSONContent) {
  return (doc.content ?? []).find(
    n =>
      n.type === 'paragraph' &&
      (n.content ?? []).length === 1 &&
      n.content?.[0].type === 'text' &&
      !n.content[0].marks,
  );
}

interface PageResult {
  page: string;
  identity: boolean;
  mdastEqual: boolean;
  mdastReason?: string;
  edit: 'ok' | 'skipped' | string;
}

function checkPage(file: string, root: string): PageResult {
  const md = fs.readFileSync(file, 'utf8');
  const page = path.relative(root, file);
  const parsed = parseMarkdown(md);

  const identity = serializeMarkdown(parsed.doc, parsed) === md;

  let mdastEqual = false;
  let mdastReason: string | undefined;
  try {
    const out = serializeMarkdown(parsed.doc, parsed, {
      preserveBlocks: false,
    });
    mdastEqual =
      JSON.stringify(normalizedMdast(out)) ===
      JSON.stringify(normalizedMdast(md));
    if (!mdastEqual) {
      mdastReason = 'normalized mdast differs after re-serialization';
    }
  } catch (e) {
    mdastReason = `serialization failed: ${(e as Error).message}`;
  }

  let edit: PageResult['edit'] = 'skipped';
  const doc = structuredClone(parsed.doc);
  const paragraph = findEditableParagraph(doc);
  if (paragraph) {
    const before = paragraph.content![0].text!;
    paragraph.content![0].text = `${before} (edited)`;
    const out = serializeMarkdown(doc, parsed);
    const changed = diffLines(md, out).filter(p => p.added || p.removed);
    const touchedLines = changed
      .filter(p => p.removed)
      .map(p => p.value)
      .join('');
    const addedLines = changed
      .filter(p => p.added)
      .map(p => p.value)
      .join('');
    const ok =
      touchedLines.includes(before) &&
      addedLines.includes(`${before} (edited)`) &&
      out.replace(' (edited)', '') === md;
    edit = ok ? 'ok' : 'diff touches more than the edited block';
  }
  return { page, identity, mdastEqual, mdastReason, edit };
}

function percent(n: number, total: number) {
  return total === 0 ? 'n/a' : `${((n / total) * 100).toFixed(1)}%`;
}

maybeDescribe('real corpus fidelity', () => {
  // describe.skip still evaluates this body, so guard the listing too
  const root = corpusDir ?? '';
  const files = corpusDir ? listMarkdown(root) : [];
  const results = files.map(file => checkPage(file, root));

  afterAll(() => {
    if (!reportPath) {
      return;
    }
    const total = results.length;
    const identity = results.filter(r => r.identity).length;
    const equal = results.filter(r => r.mdastEqual).length;
    const edits = results.filter(r => r.edit === 'ok').length;
    const editable = results.filter(r => r.edit !== 'skipped').length;
    const failing = results.filter(
      r => !r.identity || !r.mdastEqual || !['ok', 'skipped'].includes(r.edit),
    );
    const lines = [
      '# Markdown bridge fidelity report',
      '',
      `Corpus: ${total} Markdown pages.`,
      '',
      '| Check | Result |',
      '|---|---|',
      `| Identity (parse, then serialize with original, byte for byte) | ${identity}/${total} (${percent(
        identity,
        total,
      )}) |`,
      `| mdast-equal after full re-serialization (no source preservation) | ${equal}/${total} (${percent(
        equal,
        total,
      )}) |`,
      `| Single-paragraph edit touches only that block | ${edits}/${editable} (${percent(
        edits,
        editable,
      )}) |`,
      '',
      '## Failing pages',
      '',
      ...(failing.length === 0
        ? ['None.']
        : failing.map(
            r =>
              `- \`${r.page}\`: ${[
                r.identity ? '' : 'identity mismatch',
                r.mdastEqual ? '' : r.mdastReason ?? 'mdast differs',
                ['ok', 'skipped'].includes(r.edit) ? '' : r.edit,
              ]
                .filter(Boolean)
                .join('; ')}`,
          )),
      '',
    ];
    fs.writeFileSync(reportPath, lines.join('\n'));
  });

  it('finds the corpus pages', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('round-trips every page byte for byte', () => {
    expect(results.filter(r => !r.identity).map(r => r.page)).toEqual([]);
  });

  it('re-serializes at least 95% of pages to an equivalent mdast tree', () => {
    const equal = results.filter(r => r.mdastEqual).length;
    expect(equal / results.length).toBeGreaterThanOrEqual(0.95);
  });

  it('confines a single-paragraph edit to that paragraph', () => {
    expect(
      results
        .filter(r => !['ok', 'skipped'].includes(r.edit))
        .map(r => `${r.page}: ${r.edit}`),
    ).toEqual([]);
  });
});
