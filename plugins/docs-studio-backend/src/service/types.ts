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
  ProposalApproval,
  ProposalAuthor,
  ProposalEvent,
  ProposalSummary,
} from '@internal/backstage-plugin-docs-studio-common';

export const ACTIVE_STATUSES = [
  'open',
  'changes_requested',
  'approved',
] as const;

/** An author as stored, including the email used for the git commits. */
export interface StoredAuthor extends ProposalAuthor {
  commitEmail?: string;
}

/** A proposal row with everything the service needs. */
export interface ProposalRecord
  extends Omit<ProposalSummary, 'authors' | 'createdBy'> {
  description?: string;
  repoHost: string;
  createdBy: StoredAuthor;
  authors: StoredAuthor[];
  /** All approvals ever recorded, including the ones for older head commits. */
  approvals: ProposalApproval[];
}

export type NewProposalRecord = Omit<ProposalRecord, 'approvals'>;

export type StoredEvent = ProposalEvent;

export function isActiveStatus(status: string): boolean {
  return (ACTIVE_STATUSES as readonly string[]).includes(status);
}

export interface DocsStudioSettings {
  requiredApprovals: number;
  autoMergeOnApproval: boolean;
  statusContext: string;
  branchPrefix: string;
  assetsDir: string;
  maxAssetSizeMb: number;
  appBaseUrl: string;
}
