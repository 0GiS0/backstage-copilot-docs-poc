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
  ApiBlueprint,
  PageBlueprint,
  createFrontendPlugin,
  discoveryApiRef,
  fetchApiRef,
} from '@backstage/frontend-plugin-api';
import { AddonBlueprint } from '@backstage/plugin-techdocs-react/alpha';
import DescriptionIcon from '@material-ui/icons/Description';
import { DocsStudioClient, docsStudioApiRef } from './api';
import { DocsStudioToolbar } from './components/Addon/DocsStudioToolbar';
import { HideNativeEditLink } from './components/Addon/HideNativeEditLink';
import { DEFAULT_ROOT_PATH, rootRouteRef } from './routes';
import { strings } from './strings';

const api = ApiBlueprint.make({
  params: defineParams =>
    defineParams({
      api: docsStudioApiRef,
      deps: { discoveryApi: discoveryApiRef, fetchApi: fetchApiRef },
      factory: ({ discoveryApi, fetchApi }) =>
        new DocsStudioClient({ discoveryApi, fetchApi }),
    }),
});

const page = PageBlueprint.make({
  params: {
    path: DEFAULT_ROOT_PATH,
    routeRef: rootRouteRef,
    title: strings.pluginTitle,
    icon: <DescriptionIcon fontSize="inherit" />,
    noHeader: true,
    loader: () =>
      import('./components/DocsStudioPage/DocsStudioPage').then(m => (
        <m.DocsStudioPage />
      )),
  },
});

const toolbarAddon = AddonBlueprint.make({
  name: 'toolbar',
  params: {
    name: 'DocsStudioToolbar',
    location: 'Subheader',
    component: DocsStudioToolbar,
  },
});

const hideEditAddon = AddonBlueprint.make({
  name: 'hide-native-edit',
  params: {
    name: 'DocsStudioHideNativeEdit',
    location: 'Content',
    component: HideNativeEditLink,
  },
});

/**
 * Frontend plugin for Docs Studio.
 *
 * @public
 */
export const docsStudioPlugin = createFrontendPlugin({
  pluginId: 'docs-studio',
  extensions: [api, page, toolbarAddon, hideEditAddon],
  routes: {
    root: rootRouteRef,
  },
});
