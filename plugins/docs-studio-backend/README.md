# @internal/backstage-plugin-docs-studio-backend

Backend plugin for Docs Studio: proposals, approvals, and the GitHub
integration that turns doc edits into pull requests.

Docs Studio is a set of Backstage plugins that let people who have no GitHub
account or licence read TechDocs and edit pages, propose changes or create new
pages from Backstage. A GitHub App turns every proposal into a branch and a
pull request. The commit author is the Backstage user and the committer is the
GitHub App bot. Changes are approved in Backstage, and an approval is published
as a commit status that a repository ruleset requires before the merge.

| Package                                          | Role           |
| ------------------------------------------------ | -------------- |
| `@internal/backstage-plugin-docs-studio`         | Frontend       |
| `@internal/backstage-plugin-docs-studio-backend` | Backend        |
| `@internal/backstage-plugin-docs-studio-common`  | Common library |

> The packages are currently published under the `@internal` scope in this
> repository. The code is licensed under Apache-2.0.

## How it works

1. A person edits a TechDocs page (or creates one) in the frontend and sends a
   proposal. The backend commits it to a new branch and opens a pull request
   through a GitHub App. If the page already has an open proposal, the commit
   goes to that proposal and the person is added as co-author
   (`Co-authored-by`). There is one open proposal per page.
2. The commit status `docs-studio/approval` on the head commit of the pull
   request is `pending` until enough people with the
   `docs-studio.proposal.approve` permission approve **that head commit**. An
   author cannot approve their own proposal (four-eyes).
3. On approval the backend publishes the status `success` on the approved head
   commit and, unless `autoMergeOnApproval` is `false`, merges the pull request
   with a **merge commit** (not a squash), pinned to the approved SHA. If new
   commits are pushed, the approval no longer applies and the status goes back
   to `pending`.
4. A repository ruleset requires that status, from the GitHub App, so GitHub
   itself blocks any merge that was not approved in Backstage. TechDocs
   rebuilds after the merge.
5. A scheduled task keeps the database in sync with GitHub, and imports pull
   requests that licensed developers open directly in GitHub, so those can be
   approved in Backstage too.

## Requirements

- The catalog, the permission backend (`permission.enabled: true`) and TechDocs
  in the same backend. The docs of an entity are found through its
  `backstage.io/techdocs-ref` annotation (see
  [Docs location](#docs-location)).
- `app.baseUrl`, used to build the links to the proposals that are written in
  commit statuses and pull request bodies.
- A database for the plugin. Proposals are stored with Knex and the plugin runs
  its own migrations (`migrations/`). In production use a persistent database.
- A GitHub App installed on the repositories that host the docs (see below).
- A repository ruleset on the default branch (see below).
- A permission policy that handles `docs-studio.proposal.create` and
  `docs-studio.proposal.approve` (see [Permissions](#permissions)). With the
  default allow-all policy everybody can approve.

## Installation

```ts
// packages/backend/src/index.ts
backend.add(import('@internal/backstage-plugin-docs-studio-backend'));

// Registers the IS_LISTED_IN_ANNOTATION permission rule in the catalog. It is
// needed when your policy uses `docsStudioConditions.isListedInAnnotation`.
backend.add(
  import('@internal/backstage-plugin-docs-studio-backend').then(m => ({
    default: m.catalogModuleDocsStudioPermissionRules,
  })),
);
```

Install the frontend plugin `@internal/backstage-plugin-docs-studio` in the app
as well.

## GitHub App

Writes require a GitHub App integration (`integrations.github[].apps`)
installed on the repositories that host the docs. Personal access tokens are
only used for reads: any write fails with an error that asks for a GitHub App
installation.

Repository permissions of the App:

| Permission      | Access | Used for                                                          |
| --------------- | ------ | ----------------------------------------------------------------- |
| Contents        | Write  | Branches, commits (Contents and Git Data APIs) and merges.        |
| Pull requests   | Write  | Open, update, merge and close the pull requests of the proposals. |
| Commit statuses | Write  | Publish the `docs-studio/approval` status.                        |
| Metadata        | Read   | Mandatory for every GitHub App.                                   |

The App does not need webhooks: there are none in this plugin (see
[Limitations](#limitations)).

```yaml
integrations:
  github:
    - host: github.com
      # Optional. Reads only. Writes always use the App.
      token: ${GITHUB_TOKEN}
      apps:
        # Keep the credentials in a file that is not committed.
        - $include: ./github-app-credentials.yaml
```

The credentials file has the usual shape of a Backstage GitHub App:

```yaml
appId: 123456
clientId: <client id>
clientSecret: <client secret>
webhookSecret: <webhook secret>
privateKey: |
  -----BEGIN RSA PRIVATE KEY-----
  ...
  -----END RSA PRIVATE KEY-----
```

Use `allowedInstallationOwners` in the app entry if you have several Apps. When
the committer identity is resolved, the plugin picks the App whose
`allowedInstallationOwners` match the repository owner, otherwise the first App
without that filter.

> Backstage replaces arrays instead of merging them when it combines config
> files. If you add `apps` in a local config file such as
> `app-config.local.yaml`, repeat the whole `integrations.github` entry there.

## Repository ruleset

The approval in Backstage only protects the repository if GitHub enforces it.
Create a ruleset on the default branch that:

- requires a pull request (zero required reviews is fine, because the review
  happens in Backstage);
- requires the status check `docs-studio/approval` (or the value of
  `docsStudio.statusContext`) **from the GitHub App**, using its
  `integration_id`;
- has **no bypass actors**, so nobody can merge without the status;
- allows merge commits, because the plugin merges with `merge_method: merge`.

Example:

```json
{
  "name": "Docs Studio approval",
  "target": "branch",
  "enforcement": "active",
  "conditions": {
    "ref_name": { "include": ["refs/heads/main"], "exclude": [] }
  },
  "bypass_actors": [],
  "rules": [
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 0,
        "dismiss_stale_reviews_on_push": false,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": false
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": false,
        "required_status_checks": [
          { "context": "docs-studio/approval", "integration_id": 123456 }
        ]
      }
    },
    { "type": "non_fast_forward" },
    { "type": "deletion" }
  ]
}
```

`integration_id` is the id of the GitHub App. The plugin does not create or
check the ruleset: without it, a pull request can be merged in GitHub without
the Backstage approval.

## Configuration

All keys are optional and live under `docsStudio`. They match `config.d.ts`.

```yaml
docsStudio:
  allowedRepositories: # recommended, see below
    - my-org/handbook
  requiredApprovals: 1 # approvals needed for the current head commit
  autoMergeOnApproval: true # merge as soon as the threshold is met
  statusContext: docs-studio/approval # commit status context
  branchPrefix: docs-studio
  assetsDir: attachments # relative to the docs dir
  maxAssetSizeMb: 5
  committer: # optional, see "Commit identity"
    name: my-app[bot]
    email: 12345+my-app[bot]@users.noreply.github.com
  sync:
    frequency: { minutes: 1 } # refresh and external PR import
```

| Key                              | Default                | Description                                                                                                                                                                                                                                                                        |
| -------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docsStudio.allowedRepositories` | every repository       | Repositories Docs Studio may read from and write to: `owner/repo` (github.com) or `host/owner/repo`, case-insensitive. Any other repository is refused before GitHub is called, even when the GitHub App installation covers it. When unset, the plugin logs a warning at startup. |
| `docsStudio.requiredApprovals`   | `1`                    | Approvals needed, for the current head commit, before a proposal is `approved`. Must be an integer of 1 or more.                                                                                                                                                                   |
| `docsStudio.autoMergeOnApproval` | `true`                 | Merge the pull request as soon as it is approved. With `false` an approver has to publish (merge) it from the proposal page.                                                                                                                                                       |
| `docsStudio.statusContext`       | `docs-studio/approval` | Context of the commit status. It must match the status required by the ruleset.                                                                                                                                                                                                    |
| `docsStudio.branchPrefix`        | `docs-studio`          | Prefix of the proposal branches: `<prefix>/<entity-name>/<page>-<id>`. A relative path without `..` or hidden segments.                                                                                                                                                            |
| `docsStudio.assetsDir`           | `attachments`          | Directory for uploaded assets, relative to the docs dir (no `..` or hidden segments).                                                                                                                                                                                              |
| `docsStudio.maxAssetSizeMb`      | `5`                    | Maximum size of one uploaded asset, in MB. Must be greater than 0. It also sets the limit of the request body.                                                                                                                                                                     |
| `docsStudio.committer.name`      | GitHub App bot         | Committer name for commits made through the Git Data API. `name` and `email` must be set together, otherwise the plugin fails at startup.                                                                                                                                          |
| `docsStudio.committer.email`     | GitHub App bot         | Committer email, see above.                                                                                                                                                                                                                                                        |
| `docsStudio.sync.frequency`      | `{ minutes: 1 }`       | How often the sync task runs. A cron expression (`{ cron: '*/5 * * * *' }`), a duration string (`'PT5M'`) or an object with `years`, `months`, `weeks`, `days`, `hours`, `minutes`, `seconds`, `milliseconds`.                                                                     |

Other configuration that the plugin reads: `app.baseUrl` (required),
`integrations.github` and the database of the `docs-studio` plugin.

## Permissions

Docs Studio registers two resource permissions on `catalog-entity`:

| Permission                     | Action   | Required for                                                                                                        |
| ------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------- |
| `docs-studio.proposal.create`  | `create` | Creating a proposal, adding a commit to one and joining one as co-author.                                           |
| `docs-studio.proposal.approve` | `update` | Approving, requesting changes and merging. Discarding needs it too, unless the person is an author of the proposal. |

They are authorized with `resourceRef: <entityRef>` and the credentials of the
signed-in user, so your permission policy decides per entity. Reading
proposals also depends on the user being able to read the entity: an entity
that the user cannot read answers `404`, and lists leave out proposals of
entities that the user cannot read. That is how a **restricted** entity (only
its owners can read it) is also hidden from Docs Studio.

Four-eyes is enforced by the backend, not by the policy: an author can never
approve their own proposal (`403`), and the same person cannot approve the same
head commit twice (`409`).

The plugin does not ship a policy. The shared package exports the annotation
names, and the backend module registers the rule `IS_LISTED_IN_ANNOTATION`
(params `{ annotation, claims }`): it is true when any of the claims appears in
the annotation, which is a comma- or whitespace-separated list of entity refs
(a missing kind defaults to `user`, a missing namespace to `default`). Its
`toQuery` is an exact-match approximation, so list filtering only works for
annotations with a single value: use the rule for per-resource checks, as
Docs Studio does.

Sample policy:

- `catalog.entity.read` and `docs-studio.proposal.create`: an entity
  annotated `docs-studio/visibility: restricted` is only for its owners.
  Everything else is open to every signed-in user.
- `docs-studio.proposal.approve`: the owners of the entity, plus the entity
  refs listed in the `docs-studio/approvers` annotation.
- Anything else: allow.

```ts
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

class DocsPermissionPolicy implements PermissionPolicy {
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

export default createBackendModule({
  pluginId: 'permission',
  moduleId: 'docs-policy',
  register(reg) {
    reg.registerInit({
      deps: { policy: policyExtensionPoint },
      async init({ policy }) {
        policy.setPolicy(new DocsPermissionPolicy());
      },
    });
  },
});
```

Add this module with `backend.add(import('./modules/docsPolicy'))`, together
with the catalog rule module from [Installation](#installation). Service
principals (for example a static token) bypass the permission framework, so
they can read restricted entities.

Annotations on the entity:

```yaml
metadata:
  annotations:
    docs-studio/visibility: restricted
    docs-studio/approvers: user:default/jane, group:default/docs-reviewers
```

A user is considered **licensed** when their `User` entity has the
`github.com/user-login` annotation. This changes what the backend returns (the
GitHub edit URL and the commit author email) and what the frontend shows (see
the frontend README).

## Docs location

The repository and the docs of an entity are found from its annotations:

- `backstage.io/techdocs-ref: dir:<relative dir>` is resolved relative to the
  directory of the file that `backstage.io/managed-by-location` points to. That
  location must be a GitHub URL.
- `backstage.io/techdocs-ref: url:https://github.com/<owner>/<repo>/tree/<branch>/<dir>`
  is absolute. Branch names that contain a slash are not supported. The branch
  in the URL is ignored: the plugin always works against the default branch of
  the repository.

In that directory it looks for `mkdocs.yml` (or `mkdocs.yaml`) and reads
`docs_dir` (default `docs`, it has to stay inside the repository). Only GitHub
hosts configured in `integrations.github` are supported. Repository lookups are
cached for one minute.

A TechDocs route such as `Onboarding/Team Glossary/` is mapped to a Markdown
file by trying `<path>.md`, `<path>/index.md` and `<path>/README.md`. The home
page is `index.md` or `README.md`. Paths that come from the client must be
relative POSIX paths, without `..` or hidden (dot) segments, and pages must end
in `.md`.

## Behavior

- **One open proposal per page.** The database enforces it. A second
  create request for the same page joins the existing proposal and the caller
  is added as a co-author through a `Co-authored-by` trailer. Co-authors cannot
  forge trailers: any `Co-authored-by` line in the user's message is removed.
- **Branch and pull request.** The branch is
  `<branchPrefix>/<entity-name>/<page>-<short id>`, created from the default
  branch. The pull request title is `docs: <title>`. Its body lists the authors
  and ends with a hidden `<!-- docs-studio:metadata {...} -->` block (proposal
  id, entity, path, kind, authors and approvals). The sync uses it to restore
  proposals if the database is lost.
- **Conflicts.** Edits send the SHA of the file they started from. If the file
  changed, the backend answers `409` with the current SHA and content, so the
  UI can offer a reload or a diff. Uploading an asset with the same name but
  different content is also a `409`; the same content is skipped.
- **New pages.** A page is created together with an entry in the `nav` of
  `mkdocs.yml` (when it has one), in a single commit. Comments and formatting of
  `mkdocs.yml` are preserved.
- **Assets.** Images (`png`, `jpg`, `jpeg`, `gif`, `svg`, `webp`) go to
  `assetsDir`, up to 10 per request. File names are sanitized and SVG files
  with scripts or event handlers are rejected.
- **Approvals.** Approvals are tied to the head SHA. When the head changes, the
  status goes back to `open`, older approvals stop counting and the commit
  status is set to `pending` again. Approving with a stale `sha` is a `409`.
- **Commit status.** `pending` ("Pending approval in Backstage (n/m)"),
  `success` ("Approved by …") or `failure` ("Changes requested by …"), with a
  target URL to `<app.baseUrl>/docs-studio/proposals/<id>`. If GitHub rejects
  the status, the failure is logged, the check state becomes `unknown` and the
  next sync tries again.
- **Merge.** `merge_method: merge`, pinned to the approved head SHA, so a commit
  pushed after the approval can never be merged by mistake. If GitHub refuses
  (for example, the ruleset is not satisfied), `approve` returns the proposal
  with a `mergeError` and the `merge` endpoint answers `409`. The branch is
  deleted after the merge (best effort).
- **Request changes** sets the status to `failure` and needs a comment.
- **Discard** closes the pull request and deletes the branch. It is allowed to
  approvers and to the authors.
- **Auditing.** Every mutation is reported to the auditor service
  (`proposal-create`, `proposal-commit`, `proposal-approve`,
  `proposal-request-changes`, `proposal-merge`, `proposal-discard`) without the
  content of the request.

## REST API

Mounted under `/api/docs-studio`. Every route except `/health` needs the
credentials of a **user** (service credentials are refused). Errors use the
standard Backstage error format; `404` is also returned for entities the user
cannot read.

| Method and path                       | Description                                                                                                                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /health`                         | Health check.                                                                                                                                                                  |
| `GET /me`                             | Identity of the caller, including the `licensed` flag.                                                                                                                         |
| `GET /page`                           | Markdown, SHA and open proposal of a page. Query: `entityRef`, `docPath`, optional `proposalId` (read from the proposal branch). `editUrl` is only returned to licensed users. |
| `GET /asset`                          | Raw bytes of a file under the docs dir. Query: `entityRef`, `path`, optional `proposalId`. Served with `nosniff`, a restrictive CSP and `Cache-Control: private`.              |
| `GET /proposals`                      | List proposals. Query: optional `entityRef` and `path`, `scope` (`mine`, `toApprove` or `all`, default `all`) and `status` (`open`, `closed` or `any`, default `open`).        |
| `GET /proposals/:id`                  | Detail: files with their diff, events and the permissions of the caller.                                                                                                       |
| `POST /proposals`                     | Create a proposal, or join the open one for that page. `201` when created, `200` when joined. Body: `CreateProposalRequest`.                                                   |
| `POST /proposals/:id/commits`         | Add a commit to a proposal. Body: `content`, `baseSha`, optional `assets` and `message`.                                                                                       |
| `POST /proposals/:id/approve`         | Approve the current head. Optional `comment` and `sha`.                                                                                                                        |
| `POST /proposals/:id/request-changes` | Request changes. Body: `comment` (required).                                                                                                                                   |
| `POST /proposals/:id/merge`           | Merge an approved proposal (when `autoMergeOnApproval` is `false` or the automatic merge was refused).                                                                         |
| `POST /proposals/:id/discard`         | Close the pull request and delete the branch.                                                                                                                                  |

Types are in `@internal/backstage-plugin-docs-studio-common`. Limits per
request: content up to 2,000,000 characters, title 200, description 10,000,
commit message 1,000 and comment 4,000. The body limit depends on
`maxAssetSizeMb` because assets travel as base64.

A conflict answers `409` with
`{ error: { name: 'ConflictError', message }, response: { statusCode: 409 }, currentSha, currentContent }`.

## Sync

The task `docs-studio-sync` runs on `docsStudio.sync.frequency` (every minute by
default, first run after 15 seconds, one instance at a time, 5 minute timeout).
There are no webhooks, so this task is how GitHub changes reach Backstage. On
each run it:

1. **Refreshes the active proposals** against their pull request: marks them
   `merged` or `closed`, detects a moved head (status back to `open`, event
   `head_changed`) and repairs a missing or outdated commit status.
2. **Discovers pull requests** in the repositories of the catalog entities that
   have a `backstage.io/techdocs-ref` annotation and where the GitHub App is
   installed.
3. **Restores or imports** every open pull request that is not stored yet:
   pull requests from forks are skipped; one with a Docs Studio metadata block
   is restored; any other that changes files in the docs directory of an entity
   (the deepest matching docs dir wins) is imported with source `github`. Its
   author is mapped from `github.com/user-login` to a `User` entity and the
   commit status is published.

The sync reads up to 10 pages of 100 pull requests or files per repository.
Proposals show up to 50 files, and text files are compared up to 512 KB per
side. Binary files such as images are listed but not compared.

## Commit identity

The **author** of every commit is the Backstage user:

- Licensed users (with `github.com/user-login`): their GitHub noreply address,
  `<id>+<login>@users.noreply.github.com`. The numeric id is looked up through
  the GitHub API and cached for one hour. If the lookup fails, the address
  falls back to `<login>@users.noreply.github.com`.
- Unlicensed users: the `spec.profile.email` of their `User` entity. If it is
  missing the proposal is refused with an error that asks an administrator to
  add it.

The **committer** is the GitHub App bot. For multi-file commits (new pages with
nav changes, image uploads) it is set explicitly through the Git Data API, which
otherwise copies the author. Single-file edits use the Contents API, which
already commits as the App.

The bot identity (`<slug>[bot]` and `<id>+<slug>[bot]@users.noreply.github.com`)
is resolved once per App from the App in `integrations.github[].apps[]` and
cached; a failed lookup is not cached. Set `docsStudio.committer` to skip the
lookup. If the identity cannot be resolved, multi-file commits fail with a clear
error instead of falling back to the author.

Merges use a merge commit, so the commits of the human authors stay in the
history of the default branch.

Whether GitHub shows these commits as **Verified** has not been checked, and
the plugin does not sign commits itself: the Git Data API commits are created
without a signature. If your repository requires signed commits, validate it
before relying on this plugin.

## Extension point

`docsStudioGithubGatewayExtensionPoint` (`docs-studio.github-gateway`) replaces
the GitHub client. A module can call `setGateway` once with an implementation of
`GithubGateway`. The tests use it with an in-memory fake gateway. The types
`GithubGateway`, `GithubFile`, `GithubPullRequest`, `GithubPullRequestFile`,
`CommitFileChange`, `CommitIdentity`, `CommitStatusState` and `RepoRef`, and
the errors `MergeBlockedError` and `ShaMismatchError`, are exported for this.

## Limitations

- **The page lock is in-process.** Operations on the same page are serialized
  with a lock that lives in the memory of one backend process, so it does not
  coordinate several instances. The database still allows only one active
  proposal per page, and the file SHA checks still detect conflicting edits.
- **No webhooks.** Changes made in GitHub (a merge, a closed pull request, new
  commits, an external pull request) reach Backstage with the delay of the sync,
  by default up to one minute.
- **Signed commits are not handled**, and the **Verified** badge has not been
  verified (see Commit identity).
- **GitHub App required for writes.** A personal access token can read docs but
  cannot create proposals.
- **GitHub only**, and only the hosts that are configured in
  `integrations.github`. Entities must come from a GitHub URL (`dir:`) or
  reference one (`url:`). The default branch is always used, and branch names
  with slashes are not supported in `url:` references.
- **Pull requests from forks are ignored** by the sync.
- **Restricted visibility only applies in Backstage.** The repository is still
  readable in GitHub by everyone who has access to it. Use the repository
  permissions for what has to be protected there.
- **Pages only.** The editor sends one Markdown page at a time (plus its
  assets and, for a new page, the `nav` entry). Other files of the repository
  are not edited.
- The `IS_LISTED_IN_ANNOTATION` rule has an approximate `toQuery`, so it is not
  suitable for filtering lists when the annotation has several values.
- The ruleset is not created or verified by the plugin.
- Only text diffs are produced, for the first 50 files of a proposal and for
  files up to 512 KB.
- Merging needs merge commits to be allowed in the repository.
