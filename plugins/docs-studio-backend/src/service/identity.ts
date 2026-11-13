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
  AuthService,
  BackstageCredentials,
  UserInfoService,
} from '@backstage/backend-plugin-api';
import {
  Entity,
  parseEntityRef,
  stringifyEntityRef,
} from '@backstage/catalog-model';
import { CatalogService } from '@backstage/plugin-catalog-node';
import {
  ANNOTATION_GITHUB_USER_LOGIN,
  DocsStudioIdentity,
} from '@internal/backstage-plugin-docs-studio-common';

/** The identity of the caller, as Docs Studio needs it. */
export interface CallerIdentity extends DocsStudioIdentity {
  ownershipEntityRefs: string[];
}

function displayNameOf(entity: Entity | undefined, fallback: string): string {
  const profile = entity?.spec?.profile as
    | { displayName?: unknown; email?: unknown }
    | undefined;
  const fromProfile =
    typeof profile?.displayName === 'string' ? profile.displayName : undefined;
  return (
    fromProfile || entity?.metadata.title || entity?.metadata.name || fallback
  );
}

function emailOf(entity: Entity | undefined): string | undefined {
  const email = (entity?.spec?.profile as { email?: unknown } | undefined)
    ?.email;
  return typeof email === 'string' && email.trim() ? email.trim() : undefined;
}

/** Looks up user identities in the catalog. */
export class IdentityResolver {
  constructor(
    private readonly userInfo: UserInfoService,
    private readonly catalog: CatalogService,
    private readonly auth: AuthService,
  ) {}

  async fromCredentials(
    credentials: BackstageCredentials,
  ): Promise<CallerIdentity> {
    const info = await this.userInfo.getUserInfo(credentials);
    const entity = await this.catalog.getEntityByRef(info.userEntityRef, {
      credentials,
    });
    const login = entity?.metadata.annotations?.[ANNOTATION_GITHUB_USER_LOGIN];
    return {
      userEntityRef: info.userEntityRef,
      displayName: displayNameOf(
        entity,
        parseEntityRef(info.userEntityRef).name,
      ),
      email: emailOf(entity),
      licensed: Boolean(login),
      githubLogin: login || undefined,
      ownershipEntityRefs: info.ownershipEntityRefs,
    };
  }

  /** Maps a GitHub login to a catalog user, using service credentials. */
  async fromGithubLogin(
    login: string,
  ): Promise<DocsStudioIdentity | undefined> {
    const credentials = await this.auth.getOwnServiceCredentials();
    const { items } = await this.catalog.getEntities(
      {
        filter: {
          kind: 'User',
          [`metadata.annotations.${ANNOTATION_GITHUB_USER_LOGIN}`]: login,
        },
        fields: [
          'kind',
          'metadata.name',
          'metadata.namespace',
          'metadata.title',
          'metadata.annotations',
          'spec.profile',
        ],
      },
      { credentials },
    );
    const entity = items[0];
    if (!entity) {
      return undefined;
    }
    return {
      userEntityRef: stringifyEntityRef(entity),
      displayName: displayNameOf(entity, login),
      email: emailOf(entity),
      licensed: true,
      githubLogin: login,
    };
  }
}
