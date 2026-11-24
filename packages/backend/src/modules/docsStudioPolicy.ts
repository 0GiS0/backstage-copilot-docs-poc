import { createBackendModule } from '@backstage/backend-plugin-api';
import { catalogEntityReadPermission } from '@backstage/plugin-catalog-common/alpha';
import {
  catalogConditions,
  createCatalogConditionalDecision,
} from '@backstage/plugin-catalog-backend/alpha';
import {
  AuthorizeResult,
  isPermission,
  PolicyDecision,
} from '@backstage/plugin-permission-common';
import {
  PermissionPolicy,
  PolicyQuery,
  PolicyQueryUser,
} from '@backstage/plugin-permission-node';
import { policyExtensionPoint } from '@backstage/plugin-permission-node/alpha';
import {
  ANNOTATION_APPROVERS,
  ANNOTATION_VISIBILITY,
  docsStudioConditions,
  docsStudioProposalApprovePermission,
  docsStudioProposalCreatePermission,
  VISIBILITY_RESTRICTED,
} from '@internal/backstage-plugin-docs-studio-common';

/**
 * Permission policy for the Docs Studio demo.
 *
 * - Entities annotated `docs-studio/visibility: restricted` are readable only
 *   by their owners. Everything else stays readable by every signed-in user.
 * - Proposing changes follows the same rule as reading.
 * - Approving requires being an owner or being listed in the
 *   `docs-studio/approvers` annotation.
 * - Every other permission is allowed.
 *
 * Service principals (for example the static token of the Copilot chat MCP
 * actions) bypass the policy in the permission framework, so they can read
 * restricted entities.
 */
export class DocsStudioPermissionPolicy implements PermissionPolicy {
  async handle(
    request: PolicyQuery,
    user?: PolicyQueryUser,
  ): Promise<PolicyDecision> {
    const claims = user?.info.ownershipEntityRefs ?? [];

    if (
      isPermission(request.permission, catalogEntityReadPermission) ||
      isPermission(request.permission, docsStudioProposalCreatePermission)
    ) {
      return createCatalogConditionalDecision(request.permission, {
        anyOf: [
          {
            not: catalogConditions.hasAnnotation({
              annotation: ANNOTATION_VISIBILITY,
              value: VISIBILITY_RESTRICTED,
            }),
          },
          catalogConditions.isEntityOwner({ claims }),
        ],
      });
    }

    if (isPermission(request.permission, docsStudioProposalApprovePermission)) {
      return createCatalogConditionalDecision(request.permission, {
        anyOf: [
          catalogConditions.isEntityOwner({ claims }),
          docsStudioConditions.isListedInAnnotation({
            annotation: ANNOTATION_APPROVERS,
            claims,
          }),
        ],
      });
    }

    return { result: AuthorizeResult.ALLOW };
  }
}

/** Replaces the allow-all permission policy with the Docs Studio policy. */
export default createBackendModule({
  pluginId: 'permission',
  moduleId: 'docs-studio-policy',
  register(reg) {
    reg.registerInit({
      deps: { policy: policyExtensionPoint },
      async init({ policy }) {
        policy.setPolicy(new DocsStudioPermissionPolicy());
      },
    });
  },
});
