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

import { parseEntityRef, stringifyEntityRef } from '@backstage/catalog-model';
import { catalogEntityPermissionResourceRef } from '@backstage/plugin-catalog-node/alpha';
import { createPermissionRule } from '@backstage/plugin-permission-node';

// A type alias (not an interface) so it satisfies the index-signature
// constraint of the rule params.
type RuleParams = { annotation: string; claims: string[] };

/**
 * Splits an annotation value (comma- or whitespace-separated entity refs) and
 * normalizes every item. Entries that are not valid entity refs are ignored.
 */
function parseListedRefs(value: string | undefined): Set<string> {
  const refs = new Set<string>();
  for (const item of (value ?? '').split(/[\s,]+/)) {
    if (!item) {
      continue;
    }
    try {
      refs.add(
        stringifyEntityRef(
          parseEntityRef(item, {
            defaultKind: 'user',
            defaultNamespace: 'default',
          }),
        ),
      );
    } catch {
      // Not an entity ref: skip it
    }
  }
  return refs;
}

/**
 * Catalog permission rule that is true when any of the given claims is listed
 * in an entity annotation (comma- or whitespace-separated entity refs).
 *
 * @remarks
 * `toQuery` is an exact-match approximation: it only matches annotations whose
 * whole value equals one of the claims. List filtering therefore works for
 * single-value annotations only, and the rule is meant for per-resource checks
 * (`apply`), which is how the Docs Studio permissions are evaluated.
 *
 * @public
 */
export const isListedInAnnotationRule = createPermissionRule<
  typeof catalogEntityPermissionResourceRef,
  RuleParams
>({
  name: 'IS_LISTED_IN_ANNOTATION',
  description:
    'Allow entities whose annotation lists at least one of the given claims',
  resourceRef: catalogEntityPermissionResourceRef,
  apply: (entity, params) => {
    const listed = parseListedRefs(
      entity.metadata.annotations?.[params.annotation],
    );
    return params.claims.some(claim => {
      try {
        const normalized = stringifyEntityRef(
          parseEntityRef(claim, {
            defaultKind: 'user',
            defaultNamespace: 'default',
          }),
        );
        return listed.has(normalized);
      } catch {
        return false;
      }
    });
  },
  toQuery: params => ({
    key: `metadata.annotations.${params.annotation}`,
    values: params.claims,
  }),
});
