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

import { Config } from '@backstage/config';
import { InputError } from '@backstage/errors';
import { DEFAULT_STATUS_CONTEXT } from '@internal/backstage-plugin-docs-studio-common';
import { normalizeRelativePath } from '../docs/paths';
import { DocsStudioSettings } from './types';

export function readSettings(config: Config): DocsStudioSettings {
  const root = config.getOptionalConfig('docsStudio');
  const requiredApprovals = root?.getOptionalNumber('requiredApprovals') ?? 1;
  const maxAssetSizeMb = root?.getOptionalNumber('maxAssetSizeMb') ?? 5;
  if (!Number.isInteger(requiredApprovals) || requiredApprovals < 1) {
    throw new InputError(
      'docsStudio.requiredApprovals must be an integer >= 1',
    );
  }
  if (!(maxAssetSizeMb > 0)) {
    throw new InputError('docsStudio.maxAssetSizeMb must be greater than 0');
  }
  return {
    requiredApprovals,
    autoMergeOnApproval:
      root?.getOptionalBoolean('autoMergeOnApproval') ?? true,
    statusContext:
      root?.getOptionalString('statusContext') ?? DEFAULT_STATUS_CONTEXT,
    branchPrefix: normalizeRelativePath(
      root?.getOptionalString('branchPrefix') ?? 'docs-studio',
      'docsStudio.branchPrefix',
    ),
    assetsDir: normalizeRelativePath(
      root?.getOptionalString('assetsDir') ?? 'attachments',
      'docsStudio.assetsDir',
    ),
    maxAssetSizeMb,
    appBaseUrl: config.getString('app.baseUrl').replace(/\/+$/, ''),
  };
}
