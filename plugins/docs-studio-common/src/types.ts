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

/** @public */
export type ProposalStatus =
  | 'open'
  | 'changes_requested'
  | 'approved'
  | 'merged'
  | 'closed';

/** @public */
export type ProposalKind = 'edit' | 'create';

/**
 * `github` means the PR was opened directly in GitHub and imported by sync.
 * @public
 */
export type ProposalSource = 'docs-studio' | 'github';

/** @public */
export type CheckState = 'pending' | 'success' | 'failure' | 'unknown';

/** @public */
export interface DocsStudioIdentity {
  userEntityRef: string;
  displayName: string;
  email?: string;
  licensed: boolean;
  githubLogin?: string;
}

/** @public */
export interface ProposalAuthor {
  userEntityRef?: string;
  displayName: string;
  licensed: boolean;
  githubLogin?: string;
}

/** @public */
export interface ProposalApproval {
  userEntityRef: string;
  displayName: string;
  sha: string;
  createdAt: string;
  comment?: string;
}

/** @public */
export interface ProposalSummary {
  id: string;
  entityRef: string;
  /** Relative to the docs dir. */
  path: string;
  kind: ProposalKind;
  title: string;
  status: ProposalStatus;
  source: ProposalSource;
  createdBy: ProposalAuthor;
  authors: ProposalAuthor[];
  approvals: ProposalApproval[];
  requiredApprovals: number;
  checkState: CheckState;
  repo: { owner: string; name: string; defaultBranch: string };
  branch: string;
  prNumber: number;
  prUrl: string;
  headSha: string;
  createdAt: string;
  updatedAt: string;
}

/** @public */
export interface ProposalFile {
  /** Relative to the docs dir. */
  path: string;
  /** Relative to the repository root. */
  repoPath: string;
  status: 'added' | 'modified' | 'removed';
  binary: boolean;
  baseContent?: string;
  headContent?: string;
}

/** @public */
export interface ProposalEvent {
  id: string;
  type:
    | 'created'
    | 'commit'
    | 'joined'
    | 'approved'
    | 'changes_requested'
    | 'merged'
    | 'closed'
    | 'conflict'
    | 'imported'
    | 'head_changed';
  actor?: ProposalAuthor;
  sha?: string;
  message?: string;
  createdAt: string;
}

/** @public */
export interface ProposalDetail extends ProposalSummary {
  description?: string;
  files: ProposalFile[];
  /**
   * Number of files the pull request changes outside the documentation of
   * this entity. They are never returned and block approval.
   */
  hiddenFileCount?: number;
  events: ProposalEvent[];
  permissions: {
    canEdit: boolean;
    canApprove: boolean;
    canMerge: boolean;
    canDiscard: boolean;
    approveBlockedReason?:
      | 'author'
      | 'not-approver'
      | 'already-approved'
      | 'not-open'
      | 'out-of-scope';
  };
}

/** @public */
export interface PageContent {
  entityRef: string;
  docPath: string;
  /** Relative to the docs dir. */
  path: string;
  /** Relative to the repository root. */
  repoPath: string;
  sha: string;
  content: string;
  ref: string;
  /** The single open proposal for this page, if any. */
  openProposal?: ProposalSummary;
  docsDir: string;
  /** Relative to the docs dir, for example `attachments`. */
  assetsDir: string;
  /** GitHub URL, only present when the caller is licensed. */
  editUrl?: string;
}

/**
 * A binary file stored under the assets dir. The maximum size comes from the
 * backend configuration.
 * @public
 */
export interface AssetUpload {
  fileName: string;
  contentBase64: string;
}

/** @public */
export interface CreateProposalRequest {
  entityRef: string;
  kind: ProposalKind;
  /**
   * For `edit`, the existing file path. For `create`, the new file path
   * relative to the docs dir; it must end with `.md`.
   */
  path: string;
  content: string;
  /** Required for `edit`. */
  baseSha?: string;
  title?: string;
  description?: string;
  message?: string;
  /**
   * Only for `create`: adds the page to the `mkdocs.yml` nav under the section
   * that contains `parentPath`, or at the top level.
   */
  nav?: { title: string; parentPath?: string };
  assets?: AssetUpload[];
}
