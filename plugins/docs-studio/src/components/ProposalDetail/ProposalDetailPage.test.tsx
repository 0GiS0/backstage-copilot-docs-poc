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

import { fireEvent, screen } from '@testing-library/react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import type { ProposalDetail } from '@internal/backstage-plugin-docs-studio-common';
import { docsStudioApiRef } from '../../api';
import type { DocsStudioApi } from '../../api';
import { strings } from '../../strings';
import { ProposalDetailView } from './ProposalDetailPage';

function buildProposal(
  permissions: Partial<ProposalDetail['permissions']>,
): ProposalDetail {
  const author = { displayName: 'Jon', licensed: false };
  return {
    id: 'p-1',
    entityRef: 'component:default/demo',
    path: 'guide.md',
    kind: 'edit',
    title: 'Update guide',
    status: 'open',
    source: 'studio',
    createdBy: author,
    authors: [author],
    approvals: [],
    requiredApprovals: 1,
    checkState: 'success',
    repo: { owner: 'acme', name: 'demo', defaultBranch: 'main' },
    branch: 'docs-studio/p-1',
    prNumber: 7,
    prUrl: 'https://github.com/acme/demo/pull/7',
    headSha: 'abc',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    files: [],
    events: [],
    permissions: {
      canEdit: true,
      canApprove: true,
      canMerge: false,
      canDiscard: true,
      ...permissions,
    },
  } as unknown as ProposalDetail;
}

function renderDetail(
  permissions: Partial<ProposalDetail['permissions']>,
  licensed = false,
) {
  const api = {
    getMe: jest.fn(async () => ({
      userEntityRef: 'user:default/jon',
      displayName: 'Jon',
      licensed,
    })),
    getProposal: jest.fn(async () => buildProposal(permissions)),
  } as unknown as DocsStudioApi;
  return renderInTestApp(<ProposalDetailView id="p-1" />, {
    apis: [[docsStudioApiRef, api]],
  });
}

describe('ProposalDetailView', () => {
  it('disables approve when the caller is not allowed to approve', async () => {
    await renderDetail({ canApprove: false, approveBlockedReason: 'author' });

    expect(
      await screen.findByRole('button', { name: strings.detail.approve }),
    ).toBeDisabled();
  });

  it('enables approve when permitted and hides the PR link without a licence', async () => {
    await renderDetail({ canApprove: true });

    expect(
      await screen.findByRole('button', { name: strings.detail.approve }),
    ).toBeEnabled();
    expect(screen.queryByText(/github/i)).not.toBeInTheDocument();
  });

  it('labels the request-changes comment field', async () => {
    await renderDetail({ canApprove: true });
    fireEvent.click(
      await screen.findByRole('button', {
        name: strings.detail.requestChanges,
      }),
    );
    expect(
      await screen.findByLabelText(strings.detail.requestChangesComment),
    ).toBeInTheDocument();
  });
});
