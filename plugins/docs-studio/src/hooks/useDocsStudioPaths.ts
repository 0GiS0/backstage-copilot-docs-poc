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

import { useMemo } from 'react';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { DEFAULT_ROOT_PATH, rootRouteRef } from '../routes';

export interface DocsStudioPaths {
  root: string;
  proposal(id: string): string;
  edit(params: {
    entityRef: string;
    docPath: string;
    proposalId?: string;
  }): string;
  create(params: { entityRef: string; parentPath?: string }): string;
}

function withQuery(base: string, params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      search.set(key, value);
    }
  }
  return `${base}?${search.toString()}`;
}

export function buildPaths(root: string): DocsStudioPaths {
  const base = root.replace(/\/$/, '');
  return {
    root: base,
    proposal: id => `${base}/proposals/${encodeURIComponent(id)}`,
    edit: ({ entityRef, docPath, proposalId }) =>
      withQuery(`${base}/edit`, { entityRef, docPath, proposalId }),
    create: ({ entityRef, parentPath }) =>
      withQuery(`${base}/new`, { entityRef, parentPath }),
  };
}

/** Absolute app paths of the Docs Studio pages. */
export function useDocsStudioPaths(): DocsStudioPaths {
  const rootPath = useRouteRef(rootRouteRef);
  const root = rootPath?.() ?? DEFAULT_ROOT_PATH;
  return useMemo(() => buildPaths(root), [root]);
}
