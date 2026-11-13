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

import { createApiRef } from '@backstage/frontend-plugin-api';
import type {
  AssetUpload,
  CreateProposalRequest,
  DocsStudioIdentity,
  PageContent,
  ProposalDetail,
  ProposalSummary,
} from '@internal/backstage-plugin-docs-studio-common';

export interface PageQuery {
  entityRef: string;
  docPath: string;
  proposalId?: string;
}

export interface AssetQuery {
  entityRef: string;
  /** Path relative to the docs directory. */
  path: string;
  proposalId?: string;
}

export interface ListProposalsQuery {
  entityRef?: string;
  /** Page path relative to the docs directory. */
  path?: string;
  scope?: 'mine' | 'toApprove' | 'all';
  status?: 'open' | 'closed' | 'any';
}

export interface CommitToProposalRequest {
  content: string;
  baseSha: string;
  assets?: AssetUpload[];
  message?: string;
}

/** A proposal returned by approve, with the merge failure when auto-merge was attempted. */
export type ApproveResult = ProposalDetail & { mergeError?: string };

/**
 * Client for the Docs Studio backend. One method per REST route.
 *
 * @public
 */
export interface DocsStudioApi {
  getMe(): Promise<DocsStudioIdentity>;
  getPage(query: PageQuery): Promise<PageContent>;
  getAsset(query: AssetQuery): Promise<Blob>;
  listProposals(query?: ListProposalsQuery): Promise<ProposalSummary[]>;
  getProposal(id: string): Promise<ProposalDetail>;
  createProposal(request: CreateProposalRequest): Promise<ProposalDetail>;
  commitToProposal(
    id: string,
    request: CommitToProposalRequest,
  ): Promise<ProposalDetail>;
  approve(id: string, comment?: string): Promise<ApproveResult>;
  requestChanges(id: string, comment: string): Promise<ProposalDetail>;
  merge(id: string): Promise<ProposalDetail>;
  discard(id: string): Promise<ProposalDetail>;
}

/** @public */
export const docsStudioApiRef = createApiRef<DocsStudioApi>({
  id: 'plugin.docs-studio.api',
});
