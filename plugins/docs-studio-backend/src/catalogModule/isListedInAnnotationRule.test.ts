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

import { Entity } from '@backstage/catalog-model';
import { mockServices, startTestBackend } from '@backstage/backend-test-utils';
import { createBackendPlugin } from '@backstage/backend-plugin-api';
import { isListedInAnnotationRule } from './isListedInAnnotationRule';
import { catalogModuleDocsStudioPermissionRules } from './index';

const ANNOTATION = 'docs-studio/approvers';

function entity(annotations?: Record<string, string>): Entity {
  return {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: { name: 'handbook', annotations },
  };
}

describe('isListedInAnnotationRule', () => {
  const apply = (e: Entity, claims: string[]) =>
    isListedInAnnotationRule.apply(e, { annotation: ANNOTATION, claims });

  it('matches claims listed in a comma-separated annotation', () => {
    const e = entity({
      [ANNOTATION]: 'user:default/samwell_returng, group:default/approvers',
    });
    expect(apply(e, ['user:default/samwell_returng'])).toBe(true);
    expect(
      apply(e, ['user:default/jon_returng', 'group:default/approvers']),
    ).toBe(true);
    expect(apply(e, ['user:default/jon_returng'])).toBe(false);
  });

  it('accepts whitespace separators and normalizes shorthand refs', () => {
    const e = entity({ [ANNOTATION]: 'Samwell\ngroup:Approvers' });
    expect(apply(e, ['user:default/samwell'])).toBe(true);
    expect(apply(e, ['group:default/approvers'])).toBe(true);
    expect(apply(e, ['USER:default/Samwell'])).toBe(true);
  });

  it('does not match when the annotation is missing or empty', () => {
    expect(apply(entity(), ['user:default/a'])).toBe(false);
    expect(apply(entity({ [ANNOTATION]: '' }), ['user:default/a'])).toBe(false);
    expect(apply(entity({ [ANNOTATION]: 'user:default/a' }), [])).toBe(false);
  });

  it('ignores malformed items instead of throwing', () => {
    const e = entity({ [ANNOTATION]: 'a:b:c:d, user:default/a' });
    expect(apply(e, ['user:default/a'])).toBe(true);
    expect(apply(e, ['not a ref/'])).toBe(false);
  });

  it('builds an exact-match query', () => {
    expect(
      isListedInAnnotationRule.toQuery({
        annotation: ANNOTATION,
        claims: ['user:default/a'],
      }),
    ).toEqual({
      key: 'metadata.annotations.docs-studio/approvers',
      values: ['user:default/a'],
    });
  });
});

describe('catalogModuleDocsStudioPermissionRules', () => {
  it('registers the rule through the permissions registry', async () => {
    const permissionsRegistry = mockServices.permissionsRegistry.mock();
    const catalogHost = createBackendPlugin({
      pluginId: 'catalog',
      register(env) {
        env.registerInit({ deps: {}, async init() {} });
      },
    });

    await startTestBackend({
      features: [
        catalogHost,
        catalogModuleDocsStudioPermissionRules,
        permissionsRegistry.factory,
      ],
    });

    expect(permissionsRegistry.addPermissionRules).toHaveBeenCalledWith([
      isListedInAnnotationRule,
    ]);
  });
});
