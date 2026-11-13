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

import { NotAllowedError } from '@backstage/errors';
import {
  DocsStudioIdentity,
  ProposalApproval,
  ProposalAuthor,
  ProposalStatus,
} from '@internal/backstage-plugin-docs-studio-common';
import { CommitIdentity } from '../github/gateway';
import { StoredAuthor } from './types';

/** Approvals recorded for the given head commit. Older ones are stale. */
export function currentApprovals(
  approvals: ProposalApproval[],
  headSha: string,
): ProposalApproval[] {
  const seen = new Set<string>();
  return approvals.filter(a => {
    if (a.sha !== headSha || seen.has(a.userEntityRef)) {
      return false;
    }
    seen.add(a.userEntityRef);
    return true;
  });
}

export function approvalThresholdMet(
  approvals: ProposalApproval[],
  headSha: string,
  required: number,
): boolean {
  return currentApprovals(approvals, headSha).length >= required;
}

export function isAuthor(
  authors: ProposalAuthor[],
  userEntityRef: string,
): boolean {
  return authors.some(a => a.userEntityRef === userEntityRef);
}

export function canReceiveApproval(status: ProposalStatus): boolean {
  return status === 'open' || status === 'changes_requested';
}

export type ApproveBlockedReason =
  | 'author'
  | 'already-approved'
  | 'not-open'
  | undefined;

/** Why a user that may approve in general cannot approve this proposal now. */
export function approveBlockedReason(options: {
  status: ProposalStatus;
  authors: ProposalAuthor[];
  approvals: ProposalApproval[];
  headSha: string;
  userEntityRef: string;
}): ApproveBlockedReason {
  const { status, authors, approvals, headSha, userEntityRef } = options;
  if (status === 'merged' || status === 'closed') {
    return 'not-open';
  }
  if (isAuthor(authors, userEntityRef)) {
    return 'author';
  }
  const alreadyApproved = currentApprovals(approvals, headSha).some(
    a => a.userEntityRef === userEntityRef,
  );
  if (alreadyApproved) {
    return 'already-approved';
  }
  return canReceiveApproval(status) ? undefined : 'not-open';
}

function noreplyEmail(login: string, userId?: number): string {
  return userId === undefined
    ? `${login}@users.noreply.github.com`
    : `${userId}+${login}@users.noreply.github.com`;
}

/**
 * Git author of a commit made on behalf of a user. Licensed users are
 * attributed through their GitHub noreply address, unlicensed users through
 * the email of their profile.
 */
export function computeCommitAuthor(
  person: Pick<
    DocsStudioIdentity,
    'displayName' | 'email' | 'licensed' | 'githubLogin'
  >,
  githubUserId?: number,
): CommitIdentity {
  const name = person.displayName.replace(/[<>\r\n]+/g, ' ').trim();
  if (person.licensed && person.githubLogin) {
    return {
      name,
      email: noreplyEmail(person.githubLogin, githubUserId),
    };
  }
  if (person.email) {
    return { name, email: person.email };
  }
  throw new NotAllowedError(
    'Your user profile has no email address, so Docs Studio cannot attribute your changes. Ask a catalog admin to add spec.profile.email to your User entity.',
  );
}

/** Commit message with `Co-authored-by:` trailers for the other authors. */
export function buildCommitMessage(
  message: string,
  coAuthors: Array<Pick<StoredAuthor, 'displayName' | 'commitEmail'>>,
): string {
  // Users cannot forge trailers through the free-text message.
  const body = message
    .split(/\r?\n/)
    .filter(line => !/^\s*co-authored-by:/i.test(line))
    .join('\n')
    .trim();
  const trailers = coAuthors
    .filter(a => a.commitEmail)
    .map(
      a =>
        `Co-authored-by: ${a.displayName.replace(/[<>\r\n]+/g, ' ').trim()} <${
          a.commitEmail
        }>`,
    );
  return trailers.length > 0 ? `${body}\n\n${trailers.join('\n')}` : body;
}

function clip(text: string): string {
  return text.length <= 140 ? text : `${text.slice(0, 137)}...`;
}

export function pendingDescription(current: number, required: number): string {
  return clip(`Pending approval in Backstage (${current}/${required})`);
}

export function successDescription(approvedBy: string[]): string {
  return clip(`Approved by ${approvedBy.join(', ')}`);
}

export function failureDescription(requestedBy: string): string {
  return clip(`Changes requested by ${requestedBy}`);
}
