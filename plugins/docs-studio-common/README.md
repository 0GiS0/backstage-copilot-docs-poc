# @internal/backstage-plugin-docs-studio-common

Shared constants, permissions and types for Docs Studio.

Docs Studio is a set of Backstage plugins that let people read TechDocs and
edit pages, propose changes or create new pages from Backstage. A GitHub App
turns every proposal into a branch and a pull request, and the changes are
approved in Backstage before they are merged.

| Package                                          | Role           |
| ------------------------------------------------ | -------------- |
| `@internal/backstage-plugin-docs-studio`         | Frontend       |
| `@internal/backstage-plugin-docs-studio-backend` | Backend        |
| `@internal/backstage-plugin-docs-studio-common`  | Common library |

> The packages are currently published under the `@internal` scope in this
> repository. The code is licensed under Apache-2.0.

This is a `common-library` package. Apart from the permission definitions and a
condition builder it holds no runtime logic, so it can be imported from the
frontend, the backend and from your permission policy.

## Installation

Add it to the package that needs it, for example the backend package that holds
your permission policy:

```bash
yarn --cwd packages/backend add @internal/backstage-plugin-docs-studio-common
```

The frontend and backend plugins already depend on it.

## Constants

| Export                         | Value                    | Meaning                                                                                                                                       |
| ------------------------------ | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `DOCS_STUDIO_PLUGIN_ID`        | `docs-studio`            | Plugin id shared by the frontend and the backend.                                                                                             |
| `ANNOTATION_VISIBILITY`        | `docs-studio/visibility` | Entity annotation. Together with `VISIBILITY_RESTRICTED` it lets a permission policy limit an entity to its owners.                           |
| `VISIBILITY_RESTRICTED`        | `restricted`             | Value of `docs-studio/visibility` that marks an entity as restricted.                                                                         |
| `ANNOTATION_APPROVERS`         | `docs-studio/approvers`  | Entity annotation with a comma- or whitespace-separated list of entity refs that may approve, in addition to the owners.                      |
| `ANNOTATION_GITHUB_USER_LOGIN` | `github.com/user-login`  | Standard Backstage annotation. Its presence on a `User` entity means that the user has a GitHub licence (a "licensed" user).                  |
| `DEFAULT_STATUS_CONTEXT`       | `docs-studio/approval`   | Default context of the commit status that the backend publishes on the head commit of every proposal.                                         |
| `PROPOSAL_METADATA_MARKER`     | `docs-studio:metadata`   | Marker of the hidden HTML comment in the pull request body that stores the proposal metadata. The sync uses it to rebuild lost database rows. |

The backend reads `github.com/user-login`, `DEFAULT_STATUS_CONTEXT` (when
`docsStudio.statusContext` is not set) and the metadata marker. The two
`docs-studio/*` annotations are **not** enforced by the plugins themselves:
they are inputs for your permission policy (see the backend README for a
sample).

## Permissions

Both permissions are resource permissions of type `catalog-entity`. The backend
authorizes with `resourceRef: <entityRef>`, so the permission backend evaluates
the conditions that your policy returns against the catalog entity that owns
the docs.

| Export                                | Name                           | Action   | What it allows                                                                                                                                       |
| ------------------------------------- | ------------------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docsStudioProposalCreatePermission`  | `docs-studio.proposal.create`  | `create` | Propose a change to a page of the entity: create a proposal, add a commit to an open one, or join it as a co-author.                                 |
| `docsStudioProposalApprovePermission` | `docs-studio.proposal.approve` | `update` | Approve a proposal, request changes on it and merge it. Discarding is allowed to users with this permission and also to the authors of the proposal. |
| `docsStudioPermissions`               |                                |          | Array with both permissions, for policy code that has to recognise them.                                                                             |

Four-eyes (an author cannot approve their own proposal) is **not** part of the
permission: the backend enforces it separately.

## Conditions

```ts
import { docsStudioConditions } from '@internal/backstage-plugin-docs-studio-common';

docsStudioConditions.isListedInAnnotation({
  annotation: 'docs-studio/approvers',
  claims: ownershipEntityRefs,
});
```

`docsStudioConditions.isListedInAnnotation(params)` builds a
`PermissionCondition<'catalog-entity'>` for the `IS_LISTED_IN_ANNOTATION` rule.
The params are `IsListedInAnnotationParams`:

- `annotation`: the name of the entity annotation to inspect.
- `claims`: the entity refs of the user (usually `ownershipEntityRefs`).

The rule matches when any claim is listed in the annotation. It is registered in
the catalog by `catalogModuleDocsStudioPermissionRules`, exported by
`@internal/backstage-plugin-docs-studio-backend`. Without that module the
permission backend does not know the rule and the condition cannot be evaluated.

## Types

Types of the REST API of the backend, also used by the frontend client.

| Type                    | Description                                                                                                                                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ProposalStatus`        | `open`, `changes_requested`, `approved`, `merged` or `closed`.                                                                                                                                                           |
| `ProposalKind`          | `edit` (an existing page) or `create` (a new page).                                                                                                                                                                      |
| `ProposalSource`        | `docs-studio` (created from Backstage) or `github` (a pull request opened directly in GitHub and imported by the sync).                                                                                                  |
| `CheckState`            | State of the commit status: `pending`, `success`, `failure` or `unknown`.                                                                                                                                                |
| `DocsStudioIdentity`    | Identity of the caller, as returned by `GET /me`: entity ref, display name, optional email, optional GitHub login and the `licensed` flag.                                                                               |
| `ProposalAuthor`        | Author or co-author of a proposal: optional entity ref, display name, `licensed` flag and optional GitHub login.                                                                                                         |
| `ProposalApproval`      | One approval: user, the head SHA that was approved, date and optional comment.                                                                                                                                           |
| `ProposalSummary`       | Row of a proposal list: entity, page path (relative to the docs dir), kind, title, status, source, authors, approvals, required approvals, check state, repository, branch, pull request and head SHA.                   |
| `ProposalFile`          | A file changed by a proposal, with its status (`added`, `modified`, `removed`), a `binary` flag and the base and head contents for text files.                                                                           |
| `ProposalEvent`         | Activity entry. Types: `created`, `commit`, `joined`, `approved`, `changes_requested`, `merged`, `closed`, `conflict`, `imported` and `head_changed`.                                                                    |
| `ProposalDetail`        | `ProposalSummary` plus description, files, events and a `permissions` object: `canEdit`, `canApprove`, `canMerge`, `canDiscard` and `approveBlockedReason` (`author`, `not-approver`, `already-approved` or `not-open`). |
| `PageContent`           | Markdown source of a page with its blob SHA, the ref it was read from, the open proposal of the page if any, the docs dir, the assets dir and, for licensed users only, the GitHub edit URL.                             |
| `AssetUpload`           | File name and base64 content of an asset (for example an image) uploaded with a proposal.                                                                                                                                |
| `CreateProposalRequest` | Body of `POST /proposals`: entity, kind, path, content, `baseSha` (required for `edit`), optional title, description, commit message, `nav` entry (only for `create`) and assets.                                        |

## Dependencies

- `@backstage/plugin-catalog-common`
- `@backstage/plugin-permission-common`
