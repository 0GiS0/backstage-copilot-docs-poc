import { screen } from '@testing-library/react';
import {
  FetchApi,
  fetchApiRef,
  identityApiRef,
} from '@backstage/core-plugin-api';
import { mockApis, renderInTestApp } from '@backstage/frontend-test-utils';
import { LicenseGate, UNLICENSED_MESSAGE } from './LicenseGate';

function renderGate(
  userEntityRef: string,
  entityResponse: { status: number; body?: unknown },
) {
  const fetch = jest.fn(async () => ({
    ok: entityResponse.status === 200,
    status: entityResponse.status,
    json: async () => entityResponse.body,
  }));
  const rendered = renderInTestApp(
    <LicenseGate>
      <div>chat ready</div>
    </LicenseGate>,
    {
      apis: [
        [identityApiRef, mockApis.identity({ userEntityRef })],
        mockApis.discovery(),
        [fetchApiRef, { fetch } as unknown as FetchApi],
      ],
    },
  );
  return { rendered, fetch };
}

describe('LicenseGate', () => {
  it('renders the chat for users whose entity has a GitHub login', async () => {
    const { rendered, fetch } = renderGate('user:default/jon_returng', {
      status: 200,
      body: {
        metadata: { annotations: { 'github.com/user-login': 'jon_returng' } },
      },
    });
    await rendered;

    expect(await screen.findByText('chat ready')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/entities/by-name/user/default/jon_returng'),
    );
  });

  it('disables the chat when the entity has no GitHub login', async () => {
    await renderGate('user:default/someone', {
      status: 200,
      body: { metadata: { annotations: {} } },
    }).rendered;

    expect(await screen.findByText(UNLICENSED_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByText('chat ready')).not.toBeInTheDocument();
  });

  it('disables the chat when the entity does not exist', async () => {
    await renderGate('user:development/guest', { status: 404 }).rendered;

    expect(await screen.findByText(UNLICENSED_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByText('chat ready')).not.toBeInTheDocument();
  });
});
