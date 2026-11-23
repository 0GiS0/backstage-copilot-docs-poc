import { catalogEntityReadPermission } from '@backstage/plugin-catalog-common/alpha';
import {
  AuthorizeResult,
  createPermission,
} from '@backstage/plugin-permission-common';
import { PolicyQueryUser } from '@backstage/plugin-permission-node';
import {
  docsStudioProposalApprovePermission,
  docsStudioProposalCreatePermission,
} from '@internal/backstage-plugin-docs-studio-common';
import { DocsStudioPermissionPolicy } from './docsStudioPolicy';

const user = {
  info: {
    userEntityRef: 'user:default/jon_example',
    ownershipEntityRefs: [
      'user:default/jon_example',
      'group:default/engineering',
    ],
  },
} as unknown as PolicyQueryUser;

describe('DocsStudioPermissionPolicy', () => {
  const policy = new DocsStudioPermissionPolicy();

  it.each([
    ['catalog read', catalogEntityReadPermission],
    ['proposal create', docsStudioProposalCreatePermission],
  ])('%s is conditional on non-restricted or owned entities', async (_, p) => {
    const decision = await policy.handle({ permission: p }, user);

    expect(decision).toEqual({
      result: AuthorizeResult.CONDITIONAL,
      pluginId: 'catalog',
      resourceType: 'catalog-entity',
      conditions: {
        anyOf: [
          {
            not: {
              rule: 'HAS_ANNOTATION',
              resourceType: 'catalog-entity',
              params: {
                annotation: 'docs-studio/visibility',
                value: 'restricted',
              },
            },
          },
          {
            rule: 'IS_ENTITY_OWNER',
            resourceType: 'catalog-entity',
            params: { claims: user.info.ownershipEntityRefs },
          },
        ],
      },
    });
  });

  it('approve is conditional on ownership or the approvers annotation', async () => {
    const decision = await policy.handle(
      { permission: docsStudioProposalApprovePermission },
      user,
    );

    expect(decision).toEqual({
      result: AuthorizeResult.CONDITIONAL,
      pluginId: 'catalog',
      resourceType: 'catalog-entity',
      conditions: {
        anyOf: [
          {
            rule: 'IS_ENTITY_OWNER',
            resourceType: 'catalog-entity',
            params: { claims: user.info.ownershipEntityRefs },
          },
          {
            rule: 'IS_LISTED_IN_ANNOTATION',
            resourceType: 'catalog-entity',
            params: {
              annotation: 'docs-studio/approvers',
              claims: user.info.ownershipEntityRefs,
            },
          },
        ],
      },
    });
  });

  it('uses empty claims when there is no user', async () => {
    const decision = await policy.handle({
      permission: docsStudioProposalApprovePermission,
    });

    expect(JSON.stringify(decision)).toContain('"claims":[]');
  });

  it('allows every other permission', async () => {
    const other = createPermission({
      name: 'scaffolder.task.read',
      attributes: { action: 'read' },
    });

    expect(await policy.handle({ permission: other }, user)).toEqual({
      result: AuthorizeResult.ALLOW,
    });
  });
});
