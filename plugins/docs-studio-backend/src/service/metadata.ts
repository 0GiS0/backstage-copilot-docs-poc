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
  PROPOSAL_METADATA_MARKER,
  ProposalApproval,
  ProposalAuthor,
  ProposalKind,
} from '@internal/backstage-plugin-docs-studio-common';

export interface ProposalMetadata {
  v: 1;
  id: string;
  entityRef: string;
  /** Relative to the docs dir. */
  path: string;
  kind: ProposalKind;
  authors: ProposalAuthor[];
  approvals: ProposalApproval[];
}

const METADATA_PATTERN = new RegExp(
  `<!--\\s*${PROPOSAL_METADATA_MARKER}\\s+([\\s\\S]*?)\\s*-->`,
);
const BODY_DIVIDER = '\n\n---\n\n**Docs Studio proposal**';

export function encodeMetadata(metadata: ProposalMetadata): string {
  // `<` and `>` are escaped so the JSON can never close the HTML comment.
  const json = JSON.stringify(metadata)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e');
  return `<!-- ${PROPOSAL_METADATA_MARKER} ${json} -->`;
}

/** Extracts the metadata block of a PR body, if it has a valid one. */
export function decodeMetadata(body: string): ProposalMetadata | undefined {
  const match = METADATA_PATTERN.exec(body);
  if (!match) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(match[1]);
    if (
      parsed?.v === 1 &&
      typeof parsed.id === 'string' &&
      typeof parsed.entityRef === 'string' &&
      typeof parsed.path === 'string' &&
      (parsed.kind === 'edit' || parsed.kind === 'create') &&
      Array.isArray(parsed.authors) &&
      Array.isArray(parsed.approvals)
    ) {
      return parsed as ProposalMetadata;
    }
  } catch {
    // Fall through: a hand-edited body is treated as having no metadata.
  }
  return undefined;
}

function authorLine(author: ProposalAuthor): string {
  return author.githubLogin
    ? `- ${author.displayName} (${author.githubLogin})`
    : `- ${author.displayName}`;
}

export function buildPullRequestBody(options: {
  description?: string;
  authors: ProposalAuthor[];
  proposalUrl: string;
  metadata: ProposalMetadata;
}): string {
  const lines = [
    `${options.description?.trim() ?? ''}${BODY_DIVIDER}`,
    '',
    `[Review this proposal in Backstage](${options.proposalUrl})`,
    '',
    'Authors:',
    ...options.authors.map(authorLine),
    '',
    encodeMetadata(options.metadata),
  ];
  return lines.join('\n');
}

/** The free-text description of a PR body built by `buildPullRequestBody`. */
export function extractDescription(rawBody: string): string | undefined {
  const body = rawBody.replace(/\r\n/g, '\n');
  const index = body.indexOf(BODY_DIVIDER);
  const text = (
    index >= 0 ? body.slice(0, index) : body.replace(METADATA_PATTERN, '')
  ).trim();
  return text || undefined;
}
