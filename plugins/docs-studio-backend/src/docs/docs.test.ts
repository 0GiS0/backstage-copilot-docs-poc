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

import { InputError } from '@backstage/errors';
import { insertNavEntry, readDocsDir } from './mkdocs';
import { docPathCandidates, normalizeRelativePath } from './paths';
import { resolveRepoLocation } from './location';

function entity(annotations: Record<string, string>) {
  return {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: { name: 'handbook', annotations },
  };
}

describe('resolveRepoLocation', () => {
  const location =
    'url:https://github.com/acme/playground/blob/main/engineering/catalog-info.yaml';

  it('resolves dir:. relative to the managed-by-location directory', () => {
    expect(
      resolveRepoLocation(
        entity({
          'backstage.io/techdocs-ref': 'dir:.',
          'backstage.io/managed-by-location': location,
        }),
      ),
    ).toEqual({
      repo: { host: 'github.com', owner: 'acme', repo: 'playground' },
      mkdocsDir: 'engineering',
    });
  });

  it('resolves dir:<sub> and /tree/ locations', () => {
    expect(
      resolveRepoLocation(
        entity({
          'backstage.io/techdocs-ref': 'dir:./site',
          'backstage.io/managed-by-location':
            'url:https://github.com/acme/playground/tree/main/security/catalog-info.yaml',
        }),
      ).mkdocsDir,
    ).toBe('security/site');
  });

  it('resolves url: references', () => {
    expect(
      resolveRepoLocation(
        entity({
          'backstage.io/techdocs-ref':
            'url:https://github.com/acme/playground/tree/main/security',
        }),
      ),
    ).toEqual({
      repo: { host: 'github.com', owner: 'acme', repo: 'playground' },
      mkdocsDir: 'security',
    });
  });

  it('rejects references that escape the repository or lack a location', () => {
    expect(() =>
      resolveRepoLocation(
        entity({
          'backstage.io/techdocs-ref': 'dir:../../x',
          'backstage.io/managed-by-location': location,
        }),
      ),
    ).toThrow(InputError);
    expect(() =>
      resolveRepoLocation(entity({ 'backstage.io/techdocs-ref': 'dir:.' })),
    ).toThrow(InputError);
    expect(() => resolveRepoLocation(entity({}))).toThrow(InputError);
  });
});

describe('docPathCandidates', () => {
  it('maps TechDocs routes to Markdown files', () => {
    expect(docPathCandidates('Onboarding/Team%20Glossary/')).toEqual([
      'Onboarding/Team Glossary.md',
      'Onboarding/Team Glossary/index.md',
      'Onboarding/Team Glossary/README.md',
    ]);
    expect(docPathCandidates('')).toEqual(['index.md', 'README.md']);
    expect(docPathCandidates('guide/page.md')).toEqual(['guide/page.md']);
  });

  it('rejects traversal', () => {
    expect(() => docPathCandidates('../secrets')).toThrow(InputError);
    expect(() => normalizeRelativePath('a/../../b')).toThrow(InputError);
  });
});

describe('mkdocs', () => {
  const yml = [
    'site_name: Handbook # the name',
    'docs_dir: content',
    '# navigation',
    'nav:',
    '  - Home: index.md',
    '  - Onboarding:',
    '      - Glossary: onboarding/glossary.md',
    '  - Runbook: runbook.md # keep me',
    '',
  ].join('\n');

  it('reads docs_dir with a default', () => {
    expect(readDocsDir(yml)).toBe('content');
    expect(readDocsDir(undefined)).toBe('docs');
    expect(readDocsDir('site_name: x')).toBe('docs');
  });

  it('inserts into a section preserving comments', () => {
    const result = insertNavEntry(yml, {
      title: 'Tools',
      filePath: 'onboarding/tools.md',
      parentPath: 'onboarding/glossary.md',
    })!;
    expect(result).toContain('# the name');
    expect(result).toContain('# navigation');
    expect(result).toContain('# keep me');
    expect(result).toMatch(
      /Glossary: onboarding\/glossary.md\n\s+- Tools: onboarding\/tools.md/,
    );
  });

  it('appends at the top level and skips listed pages or missing nav', () => {
    expect(insertNavEntry(yml, { title: 'New', filePath: 'new.md' })).toMatch(
      /- New: new.md\n$/,
    );
    expect(
      insertNavEntry(yml, { title: 'Home', filePath: 'index.md' }),
    ).toBeUndefined();
    expect(
      insertNavEntry('site_name: x\n', { title: 'a', filePath: 'a.md' }),
    ).toBeUndefined();
  });
});
