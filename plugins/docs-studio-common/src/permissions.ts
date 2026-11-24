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
  createPermission,
  PermissionCondition,
} from '@backstage/plugin-permission-common';
import { RESOURCE_TYPE_CATALOG_ENTITY } from '@backstage/plugin-catalog-common/alpha';

/**
 * Permission to propose changes to the docs of a catalog entity.
 * @public
 */
export const docsStudioProposalCreatePermission = createPermission({
  name: 'docs-studio.proposal.create',
  attributes: { action: 'create' },
  resourceType: RESOURCE_TYPE_CATALOG_ENTITY,
});

/**
 * Permission to approve, request changes on, or merge a docs proposal.
 * @public
 */
export const docsStudioProposalApprovePermission = createPermission({
  name: 'docs-studio.proposal.approve',
  attributes: { action: 'update' },
  resourceType: RESOURCE_TYPE_CATALOG_ENTITY,
});

/** @public */
export const docsStudioPermissions = [
  docsStudioProposalCreatePermission,
  docsStudioProposalApprovePermission,
];

/**
 * Parameters of the `IS_LISTED_IN_ANNOTATION` catalog permission rule.
 * @public
 */
export interface IsListedInAnnotationParams {
  annotation: string;
  claims: string[];
}

/**
 * Plain condition builders for the catalog permission rules that the
 * Docs Studio backend module registers.
 * @public
 */
export const docsStudioConditions = {
  isListedInAnnotation: (
    params: IsListedInAnnotationParams,
  ): PermissionCondition<typeof RESOURCE_TYPE_CATALOG_ENTITY> => ({
    rule: 'IS_LISTED_IN_ANNOTATION',
    resourceType: RESOURCE_TYPE_CATALOG_ENTITY,
    params: { ...params },
  }),
};
