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

import { useEffect } from 'react';
import { useShadowRoot } from '@backstage/plugin-techdocs-react';
import { useDocsStudioIdentity } from '../../hooks/useDocsStudioIdentity';

const STYLE_ID = 'docs-studio-hide-native-edit';

/**
 * Content addon that hides TechDocs' native "edit this page" pencil inside the
 * reader shadow DOM for users without a GitHub licence, who could not use it.
 * Renders nothing.
 */
export function HideNativeEditLink() {
  const shadowRoot = useShadowRoot();
  const { value: identity } = useDocsStudioIdentity();
  const hide = identity?.licensed === false;

  useEffect(() => {
    if (!shadowRoot || !hide) {
      return undefined;
    }
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent =
      '[title="Edit this page"] { display: none !important; }';
    shadowRoot.appendChild(style);
    return () => style.remove();
  }, [shadowRoot, hide]);

  return null;
}
