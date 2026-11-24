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

import { GFM_ADMONITION_KINDS, MkdocsMarker } from './types';

export interface MkdocsAdmonitionRegion {
  start: number;
  end: number;
  marker: MkdocsMarker;
  kind: string;
  /** `null` when no title was written, `''` for the explicit `""`. */
  title: string | null;
  /** Body with the 4-space indentation removed, `\n` line endings. */
  body: string;
}

const HEADER_RE = /^(!!!|\?\?\?\+?)[ \t]+(\S.*?)(?:[ \t]+"(.*)")?[ \t]*$/;
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;

interface Line {
  start: number;
  /** End offset excluding the line terminator. */
  end: number;
  /** Offset of the next line. */
  next: number;
  text: string;
}

function splitLines(source: string): Line[] {
  const lines: Line[] = [];
  let pos = 0;
  while (pos < source.length) {
    const nl = source.indexOf('\n', pos);
    const next = nl === -1 ? source.length : nl + 1;
    let end = nl === -1 ? source.length : nl;
    if (end > pos && source[end - 1] === '\r') {
      end -= 1;
    }
    lines.push({ start: pos, end, next, text: source.slice(pos, end) });
    pos = next;
  }
  return lines;
}

const isBlank = (line: Line) => line.text.trim() === '';
const isIndented = (line: Line) => /^( {4}|\t)/.test(line.text);

/**
 * Finds top-level MkDocs admonitions (`!!! note "Title"`, `??? note`,
 * `???+ note`) followed by a body indented with four spaces.
 */
export function findMkdocsAdmonitions(
  source: string,
): MkdocsAdmonitionRegion[] {
  const lines = splitLines(source);
  const regions: MkdocsAdmonitionRegion[] = [];
  let fence: string | undefined;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const fenceMatch = FENCE_RE.exec(line.text);
    if (fence) {
      if (
        fenceMatch &&
        fenceMatch[1][0] === fence[0] &&
        fenceMatch[1].length >= fence.length &&
        line.text.trim() === fenceMatch[1]
      ) {
        fence = undefined;
      }
      continue;
    }
    if (fenceMatch) {
      fence = fenceMatch[1];
      continue;
    }

    const header = HEADER_RE.exec(line.text);
    const previousBlank = i === 0 || isBlank(lines[i - 1]);
    if (!header || !previousBlank) {
      continue;
    }

    let last = i;
    let j = i + 1;
    while (j < lines.length) {
      if (isIndented(lines[j]) && !isBlank(lines[j])) {
        last = j;
        j += 1;
      } else if (isBlank(lines[j])) {
        let k = j;
        while (k < lines.length && isBlank(lines[k])) {
          k += 1;
        }
        if (k < lines.length && isIndented(lines[k])) {
          j = k;
        } else {
          break;
        }
      } else {
        break;
      }
    }

    const body = lines
      .slice(i + 1, last + 1)
      .map(l => (isBlank(l) ? '' : l.text.replace(/^( {4}|\t)/, '')))
      .join('\n');

    regions.push({
      start: line.start,
      end: lines[last].end,
      marker: header[1] as MkdocsMarker,
      kind: header[2],
      title: header[3] === undefined ? null : header[3],
      body,
    });
    i = last;
  }
  return regions;
}

/** Replaces the regions with spaces, keeping offsets and line breaks intact. */
export function maskRegions(
  source: string,
  regions: Array<{ start: number; end: number }>,
): string {
  if (regions.length === 0) {
    return source;
  }
  let out = '';
  let pos = 0;
  for (const r of regions) {
    out += source.slice(pos, r.start);
    out += source.slice(r.start, r.end).replace(/[^\r\n]/g, ' ');
    pos = r.end;
  }
  return out + source.slice(pos);
}

const GFM_HEADER_RE = new RegExp(
  `^\\[!(${GFM_ADMONITION_KINDS.join('|')})\\](?:\\n|$)`,
  'i',
);

/** Returns the GFM alert kind when `text` starts with a `[!KIND]` header. */
export function matchGfmAlert(
  text: string,
): { kind: string; rest: string } | undefined {
  const match = GFM_HEADER_RE.exec(text);
  if (!match) {
    return undefined;
  }
  return { kind: match[1].toUpperCase(), rest: text.slice(match[0].length) };
}

export function mkdocsHeader(
  marker: string,
  kind: string,
  title: string | null | undefined,
): string {
  return `${marker} ${kind}${
    title === null || title === undefined ? '' : ` "${title}"`
  }`;
}
