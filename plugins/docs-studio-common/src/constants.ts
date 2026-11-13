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

/** @public */
export const DOCS_STUDIO_PLUGIN_ID = 'docs-studio';

/**
 * `restricted` means only owners (`ownedBy` relation) can read the entity and
 * its docs.
 * @public
 */
export const ANNOTATION_VISIBILITY = 'docs-studio/visibility';

/** @public */
export const VISIBILITY_RESTRICTED = 'restricted';

/**
 * Comma-separated entity refs (`user:default/x`, `group:default/y`) allowed to
 * approve proposals, in addition to the owners.
 * @public
 */
export const ANNOTATION_APPROVERS = 'docs-studio/approvers';

/**
 * Standard Backstage annotation. Its presence on a User entity means the user
 * has a GitHub (GHEC/EMU) license.
 * @public
 */
export const ANNOTATION_GITHUB_USER_LOGIN = 'github.com/user-login';

/** @public */
export const DEFAULT_STATUS_CONTEXT = 'docs-studio/approval';

/** @public */
export const PROPOSAL_METADATA_MARKER = 'docs-studio:metadata';
