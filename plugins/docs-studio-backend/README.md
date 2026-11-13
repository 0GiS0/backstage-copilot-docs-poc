# @internal/backstage-plugin-docs-studio-backend

Backend plugin for Docs Studio: proposals, approvals, and the GitHub
integration that turns doc edits into pull requests.

Part of Docs Studio, a set of Backstage plugins to edit TechDocs from the
browser and review the changes before they are published.

## Installation

```ts
// packages/backend/src/index.ts
backend.add(import('@internal/backstage-plugin-docs-studio-backend'));
```

Writes require a GitHub App integration (`integrations.github[].apps`) installed
on the repositories that host the docs. Personal access tokens are only used for
reads.

## Configuration

```yaml
docsStudio:
  requiredApprovals: 1 # approvals needed for the current head commit
  autoMergeOnApproval: false # merge as soon as the threshold is met
  statusContext: docs-studio/approval # commit status context
  branchPrefix: docs-studio
  assetsDir: attachments # relative to the docs dir
  maxAssetSizeMb: 5
  committer: # optional, see below
    name: my-app[bot]
    email: 12345+my-app[bot]@users.noreply.github.com
  sync:
    frequency: { minutes: 1 } # refresh and external PR import
```

## Behavior

- Proposals are pull requests; the head commit status `docs-studio/approval`
  is `pending` until enough approvals exist for the current head.
- Authors cannot approve their own proposals (four-eyes).
- A background task refreshes open proposals and imports open pull requests
  that touch an entity's docs directory.

## Commit identity

The author of every commit is the Backstage user (their noreply or profile
email). The committer is the GitHub App bot: for multi-file commits (new pages
with nav changes, image uploads) it is set explicitly through the Git Data API,
which otherwise copies the author. Single-file edits use the Contents API,
which already commits as the App.

The bot identity (`<slug>[bot]` and `<id>+<slug>[bot]@users.noreply.github.com`)
is resolved once per App from the App in `integrations.github[].apps[]`. Set
`docsStudio.committer` to skip the lookup. If the identity cannot be resolved,
multi-file commits fail with a clear error instead of falling back to the
author.

## Testing and extension point

The GitHub client can be replaced through
`docsStudioGithubGatewayExtensionPoint` (used by the tests with an in-memory
fake gateway).
