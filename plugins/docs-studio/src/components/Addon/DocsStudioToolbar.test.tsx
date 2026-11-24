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

import { screen } from '@testing-library/react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import type {
  DocsStudioIdentity,
  PageContent,
} from '@internal/backstage-plugin-docs-studio-common';
import { docsStudioApiRef } from '../../api';
import type { DocsStudioApi } from '../../api';
import { strings } from '../../strings';
import { DocsStudioToolbar } from './DocsStudioToolbar';

jest.mock('@backstage/plugin-techdocs-react', () => ({
  useTechDocsReaderPage: () => ({
    entityRef: { kind: 'component', namespace: 'default', name: 'demo' },
  }),
}));

const page = {
  entityRef: 'component:default/demo',
  docPath: 'guide',
  path: 'guide.md',
  editUrl: 'https://github.com/acme/demo/edit/main/docs/guide.md',
} as PageContent;

function renderToolbar(identity: Partial<DocsStudioIdentity>, content = page) {
  const api = {
    getMe: jest.fn(async () => ({
      userEntityRef: 'user:default/jon',
      displayName: 'Jon',
      licensed: false,
      ...identity,
    })),
    getPage: jest.fn(async () => content),
  } as unknown as DocsStudioApi;
  return renderInTestApp(<DocsStudioToolbar />, {
    apis: [[docsStudioApiRef, api]],
    initialRouteEntries: ['/docs/default/component/demo/guide/'],
  });
}

describe('DocsStudioToolbar', () => {
  it('hides the GitHub link for users without a licence', async () => {
    await renderToolbar({ licensed: false });

    expect(
      await screen.findByRole('button', { name: strings.addon.edit }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: strings.addon.viewOnGithub }),
    ).not.toBeInTheDocument();
  });

  it('shows the GitHub link for licensed users', async () => {
    await renderToolbar({ licensed: true });

    expect(
      await screen.findByRole('link', { name: strings.addon.viewOnGithub }),
    ).toHaveAttribute('href', page.editUrl);
  });

  it('shows a banner linking to the open proposal', async () => {
    await renderToolbar({ licensed: false }, {
      ...page,
      openProposal: { id: 'p-1' },
    } as PageContent);

    expect(
      await screen.findByText(strings.addon.pendingBanner),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: strings.addon.viewProposal }),
    ).toHaveAttribute('href', expect.stringContaining('proposals/p-1'));
  });
});
