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

import {
  docPathFromLocation,
  isValidMarkdownPath,
  relativePath,
  slugify,
} from './paths';

describe('paths', () => {
  it('extracts the doc path from reader and entity-tab locations', () => {
    expect(
      docPathFromLocation('/docs/default/component/demo/guide/intro/'),
    ).toBe('guide/intro/');
    expect(docPathFromLocation('/docs/default/component/demo')).toBe('');
    expect(
      docPathFromLocation('/catalog/default/component/demo/docs/a%20b'),
    ).toBe('a b');
  });

  it('slugifies titles and validates markdown paths', () => {
    expect(slugify('  Cómo desplegar: v2! ')).toBe('como-desplegar-v2');
    expect(isValidMarkdownPath('guide/intro.md')).toBe(true);
    expect(isValidMarkdownPath('../x.md')).toBe(false);
    expect(isValidMarkdownPath('/abs.md')).toBe(false);
    expect(isValidMarkdownPath('notes.txt')).toBe(false);
  });

  it('computes relative paths from a directory to an asset', () => {
    expect(relativePath('guide', 'attachments/a.png')).toBe(
      '../attachments/a.png',
    );
    expect(relativePath('', 'attachments/a.png')).toBe('attachments/a.png');
  });
});
