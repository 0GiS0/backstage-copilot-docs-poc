import { ReactNode, useEffect, useState } from 'react';
import {
  discoveryApiRef,
  fetchApiRef,
  identityApiRef,
  useApi,
} from '@backstage/core-plugin-api';
import { Content, Header, Page, Progress } from '@backstage/core-components';
import { Typography } from '@material-ui/core';

// Presence of this annotation on the User entity means the user has a GitHub
// (EMU) account with a Copilot license. Kept as a literal on purpose: this
// plugin must not depend on docs-studio.
const GITHUB_USER_LOGIN_ANNOTATION = 'github.com/user-login';

export const UNLICENSED_MESSAGE =
  'Chat requires a GitHub Copilot license. Ask your administrator for access.';

type LicenseState = 'loading' | 'licensed' | 'unlicensed';

function entityPath(entityRef: string): string | undefined {
  const match = /^([^:/]+):([^:/]+)\/([^:/]+)$/.exec(entityRef);
  if (!match) {
    return undefined;
  }
  const [, kind, namespace, name] = match;
  return [kind, namespace, name].map(encodeURIComponent).join('/');
}

/**
 * Resolves whether the signed-in user is licensed: their User entity has the
 * `github.com/user-login` annotation. Fails closed (unlicensed) when the entity
 * is missing (for example the guest user) or the lookup fails.
 */
export function useCopilotLicense(): LicenseState {
  const identityApi = useApi(identityApiRef);
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState<LicenseState>('loading');

  useEffect(() => {
    let cancelled = false;

    async function check(): Promise<LicenseState> {
      const { userEntityRef } = await identityApi.getBackstageIdentity();
      const path = entityPath(userEntityRef);
      if (!path) {
        return 'unlicensed';
      }
      const catalogUrl = await discoveryApi.getBaseUrl('catalog');
      const response = await fetchApi.fetch(
        `${catalogUrl}/entities/by-name/${path}`,
      );
      if (!response.ok) {
        return 'unlicensed';
      }
      const entity = await response.json();
      return entity?.metadata?.annotations?.[GITHUB_USER_LOGIN_ANNOTATION]
        ? 'licensed'
        : 'unlicensed';
    }

    check()
      .catch((): LicenseState => 'unlicensed')
      .then(result => {
        if (!cancelled) {
          setState(result);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [identityApi, discoveryApi, fetchApi]);

  return state;
}

/**
 * Renders its children only for licensed users. Anyone else gets a disabled
 * chat page, and children (which would call the GitHub auth API) never mount.
 */
export const LicenseGate = ({ children }: { children: ReactNode }) => {
  const license = useCopilotLicense();

  if (license === 'licensed') {
    return <>{children}</>;
  }

  return (
    <Page themeId="tool">
      <Header
        title="Copilot Chat"
        subtitle="Ask the engineering docs, powered by the Microsoft Copilot SDK (formerly GitHub Copilot SDK)"
      />
      <Content>
        {license === 'loading' ? (
          <Progress />
        ) : (
          <Typography variant="body1" role="alert">
            {UNLICENSED_MESSAGE}
          </Typography>
        )}
      </Content>
    </Page>
  );
};
