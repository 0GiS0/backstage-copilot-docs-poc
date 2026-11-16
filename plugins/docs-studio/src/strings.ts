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

import type {
  CheckState,
  ProposalEvent,
  ProposalStatus,
} from '@internal/backstage-plugin-docs-studio-common';

/** All user-facing copy lives here so it can be translated later. */
export const strings = {
  pluginTitle: 'Docs Studio',
  loading: 'Loading…',
  cancel: 'Cancel',
  close: 'Close',
  unknownError: 'An unexpected error occurred.',

  list: {
    title: 'Docs Studio',
    subtitle: 'Proposed changes to the documentation',
    tabsLabel: 'Proposal filters',
    tabMine: 'My proposals',
    tabToApprove: 'Awaiting my approval',
    tabAll: 'All',
    tableTitle: 'Proposals',
    empty: 'There are no proposals in this view.',
    columns: {
      title: 'Title',
      page: 'Page',
      entity: 'Documentation',
      status: 'Status',
      checks: 'Review',
      authors: 'Authors',
      updated: 'Updated',
    },
    kindCreate: 'New page',
    kindEdit: 'Edit',
    searchPlaceholder: 'Filter',
  },

  status: {
    open: 'Open',
    changes_requested: 'Changes requested',
    approved: 'Approved',
    merged: 'Published',
    closed: 'Discarded',
  } satisfies Record<ProposalStatus, string>,

  checkState: {
    pending: 'Awaiting approval',
    success: 'Approval complete',
    failure: 'Changes requested',
    unknown: 'No information',
  } satisfies Record<CheckState, string>,

  author: {
    licensed: 'GitHub licensed',
    unlicensed: 'unlicensed',
    authors: 'Authors',
  },

  detail: {
    back: 'Back to proposals',
    loadError: 'The proposal could not be loaded.',
    page: 'Page',
    entity: 'Documentation',
    branch: 'Branch',
    approvals: (current: number, required: number) =>
      `Approvals: ${current} of ${required}`,
    approvalsTitle: 'Approvals',
    noApprovals: 'No approvals yet.',
    approvedBy: (name: string) => `Approved by ${name}`,
    changesTitle: 'Changes',
    noChanges: 'This proposal does not contain file changes.',
    binaryFile: 'Binary file: the difference cannot be shown.',
    fileAdded: 'New',
    fileModified: 'Modified',
    fileRemoved: 'Deleted',
    noDifferences: 'No differences.',
    eventsTitle: 'Activity',
    viewOnGithub: 'View pull request on GitHub',
    editProposal: 'Edit proposal',
    approve: 'Approve',
    requestChanges: 'Request changes',
    merge: 'Publish',
    discard: 'Discard',
    approveBlocked: {
      author: 'You cannot approve a proposal you authored.',
      'not-approver': 'You do not have permission to approve this proposal.',
      'already-approved':
        'You have already approved this version of the proposal.',
      'not-open': 'The proposal is no longer open.',
    },
    approveDone: 'Approval recorded.',
    mergeFailedAfterApproval: (message: string) =>
      `Approved, but it could not be published automatically: ${message}`,
    requestChangesDone: 'Changes requested.',
    mergeDone: 'Changes published.',
    discardDone: 'Proposal discarded.',
    requestChangesDialogTitle: 'Request changes',
    requestChangesComment: 'Comment',
    requestChangesHelp: 'Explain what needs to change before approval.',
    requestChangesSubmit: 'Submit',
    discardDialogTitle: 'Discard the proposal?',
    discardDialogBody:
      'The proposal will be closed and its pending changes will be deleted. This action cannot be undone.',
    discardConfirm: 'Discard proposal',
    eventType: {
      created: 'Proposal created',
      commit: 'New changes',
      joined: 'Joined as an author',
      approved: 'Approved',
      changes_requested: 'Changes requested',
      merged: 'Published',
      closed: 'Closed',
      conflict: 'Conflict detected',
      imported: 'Imported from GitHub',
      head_changed: 'The branch has changed',
    } satisfies Record<ProposalEvent['type'], string>,
  },

  edit: {
    title: 'Edit page',
    pageTitle: 'Edit page',
    missingParams: 'The documentation or the page to edit is missing.',
    loadError: 'The page could not be loaded.',
    editingProposal: 'You are editing an open proposal.',
    existingProposalNotice:
      'This page already has an open proposal. Your changes will be added to it.',
    viewExistingProposal: 'View proposal',
    messageLabel: 'Change message',
    messageHelp: 'Briefly describe what you changed.',
    messagePlaceholder: 'docs: update the page',
    submit: 'Propose changes',
    submitting: 'Submitting…',
    cancel: 'Cancel',
    frontmatterInvalid: 'Fix the front matter YAML before proposing changes.',
    nothingChanged: 'There are no changes to propose yet.',
    submitError: 'The changes could not be submitted.',
    unsavedChanges: 'There are unsubmitted changes.',
    pendingImages: (count: number) =>
      count === 1
        ? 'One new image will be uploaded with the proposal.'
        : `${count} new images will be uploaded with the proposal.`,
    imageUploadFailed: 'The image could not be read.',
    imageUploadTooLarge: 'The image is too large.',
  },

  conflict: {
    title: 'This page has changed',
    body: 'Someone changed this page while you were editing it. You can reload the latest version (your changes will be lost) or review the differences.',
    reload: 'Reload',
    showDiff: 'View differences',
    backToChoice: 'Back',
    diffTitle: 'Your changes compared with the current version',
    diffLegend:
      'Red lines are from the current version; green lines are from your version.',
    close: 'Close',
  },

  create: {
    title: 'New page',
    missingParams: 'The documentation to create the page in is missing.',
    titleLabel: 'Page title',
    fileNameLabel: 'File path',
    fileNameHelp:
      'Generated from the title. It must end in .md. You can include folders.',
    parentLabel: 'Menu section (file of an existing page)',
    parentHelp: 'Leave empty to add it to the top level of the menu.',
    submit: 'Propose page',
    titleRequired: 'Enter a title.',
    fileNameInvalid:
      'The name must end in .md and cannot contain ".." or start with "/".',
    submitError: 'The page could not be submitted.',
    defaultMessage: (title: string) => `docs: add "${title}"`,
  },

  addon: {
    pendingBanner: 'Changes to this page are pending review',
    viewProposal: 'View proposal',
    edit: 'Edit this page',
    newPage: 'New page',
    viewOnGithub: 'View on GitHub',
    toolbarLabel: 'Docs Studio actions',
  },
};
