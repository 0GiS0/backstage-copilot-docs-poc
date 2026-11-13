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

import { parse as parseYaml } from 'yaml';

/** A `---` delimited YAML front-matter block split into editable parts. */
export interface FrontmatterParts {
  open: string;
  inner: string;
  close: string;
  eol: string;
}

const FENCED = /^(---[ \t]*(\r?\n))([\s\S]*?)(\r?\n)?(---[ \t]*)$/;

export function splitFrontmatter(raw: string): FrontmatterParts | undefined {
  const match = FENCED.exec(raw);
  if (!match) {
    return undefined;
  }
  const [, open, eol, inner, , close] = match;
  return { open, inner, close, eol };
}

export function joinFrontmatter(parts: FrontmatterParts, inner: string) {
  const body = inner === '' ? '' : `${inner}${parts.eol}`;
  return `${parts.open}${body}${parts.close}`;
}

/** Returns a human readable message when `text` is not valid YAML. */
export function yamlError(text: string): string | undefined {
  try {
    parseYaml(text);
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
