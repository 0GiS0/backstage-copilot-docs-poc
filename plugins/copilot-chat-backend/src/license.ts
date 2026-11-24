import {
  AuthService,
  DiscoveryService,
  HttpAuthService,
  UserInfoService,
} from '@backstage/backend-plugin-api';
import express from 'express';

// Presence of this annotation on the User entity means the user has a GitHub
// (EMU) account with a Copilot license.
const GITHUB_USER_LOGIN_ANNOTATION = 'github.com/user-login';

export function entityPath(entityRef: string): string | undefined {
  const match = /^([^:/]+):([^:/]+)\/([^:/]+)$/.exec(entityRef);
  if (!match) {
    return undefined;
  }
  return match
    .slice(1)
    .map(part => encodeURIComponent(part))
    .join('/');
}

/**
 * Builds a check that looks up the caller's User entity in the catalog (with
 * the caller's own credentials) and requires the `github.com/user-login`
 * annotation. Fails closed.
 */
export function createLicenseCheck(deps: {
  auth: AuthService;
  httpAuth: HttpAuthService;
  userInfo: UserInfoService;
  discovery: DiscoveryService;
}): (req: express.Request) => Promise<boolean> {
  const { auth, httpAuth, userInfo, discovery } = deps;

  return async req => {
    const credentials = await httpAuth.credentials(req, { allow: ['user'] });
    const { userEntityRef } = await userInfo.getUserInfo(credentials);
    const path = entityPath(userEntityRef);
    if (!path) {
      return false;
    }

    const { token } = await auth.getPluginRequestToken({
      onBehalfOf: credentials,
      targetPluginId: 'catalog',
    });
    const baseUrl = await discovery.getBaseUrl('catalog');
    const response = await fetch(`${baseUrl}/entities/by-name/${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      return false;
    }
    const entity = (await response.json()) as {
      metadata?: { annotations?: Record<string, string> };
    };
    return Boolean(
      entity.metadata?.annotations?.[GITHUB_USER_LOGIN_ANNOTATION],
    );
  };
}
