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

import { createExtensionPoint } from '@backstage/backend-plugin-api';
import { GithubGateway } from './github/gateway';

/**
 * Lets a module replace the GitHub client, which is mostly useful in tests.
 *
 * @public
 */
export interface DocsStudioGithubGatewayExtensionPoint {
  setGateway(gateway: GithubGateway): void;
}

/** @public */
export const docsStudioGithubGatewayExtensionPoint =
  createExtensionPoint<DocsStudioGithubGatewayExtensionPoint>({
    id: 'docs-studio.github-gateway',
  });
