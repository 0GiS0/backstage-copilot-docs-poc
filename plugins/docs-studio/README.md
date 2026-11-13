# @internal/backstage-plugin-docs-studio

Frontend plugin for Docs Studio: a TechDocs addon, a visual Markdown editor for
MkDocs pages and the pages to review proposals.

Docs Studio is a set of Backstage plugins that let people who have no GitHub
account or licence read TechDocs and edit pages, propose changes or create new
pages from Backstage. A GitHub App turns every proposal into a branch and a
pull request; the commit author is the Backstage user and the committer is the
GitHub App bot. Changes are approved in Backstage before they are merged, and
TechDocs rebuilds afterwards.

| Package                                          | Role           |
| ------------------------------------------------ | -------------- |
| `@internal/backstage-plugin-docs-studio`         | Frontend       |
| `@internal/backstage-plugin-docs-studio-backend` | Backend        |
| `@internal/backstage-plugin-docs-studio-common`  | Common library |

> The packages are currently published under the `@internal` scope in this
> repository. The code is licensed under Apache-2.0.

This package contains only the user interface. Every action goes through the
REST API of `@internal/backstage-plugin-docs-studio-backend` with the
credentials of the signed-in user, so the backend decides what each person may
do.

## Features

### TechDocs addon

Two addons are registered for the TechDocs reader:

- **Toolbar** (location `Subheader`), shown on every TechDocs page:
  - an **Edit this page** button that opens the editor on the current page;
  - a **New page** button that opens the new page form, with the current page
    as the default place in the navigation;
  - an informational banner, with a link to the proposal, when the page already
    has an open proposal;
  - a **View on GitHub** link, shown only to licensed users (see below).
- **Hide native edit link** (location `Content`): hides the default "Edit this
  page" pencil of the MkDocs theme for users that are not licensed, because it
  points to GitHub, where they have no access. It injects CSS into the shadow
  DOM of the reader.

The toolbar buttons are always shown; whether the person is allowed to propose
is decided by the backend (`docs-studio.proposal.create`) when they submit.

### Pages

The plugin registers a page at `/docs-studio` (titled "Docs Studio", so
sidebars that build their items from pages show it). Inside it:

| Route                                     | Content                                                                                                                                                                                                                                                      |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/docs-studio`                            | Proposal list with three tabs: mine, pending my approval and all.                                                                                                                                                                                            |
| `/docs-studio/proposals/:id`              | Proposal detail: status, check state, authors, approvals, activity, a line diff of every changed file and the actions (approve, request changes, publish, discard, edit the proposal). Each action is enabled from the permissions that the backend returns. |
| `/docs-studio/edit?entityRef=&docPath=`   | Editor for an existing page. Also accepts `proposalId` to continue editing an open proposal.                                                                                                                                                                 |
| `/docs-studio/new?entityRef=&parentPath=` | Form to create a page: title, file path (generated from the title) and optional parent section in the navigation.                                                                                                                                            |

Editing a page that already has an open proposal opens the version on the
proposal branch, and saving adds a commit to that proposal. The second editor
becomes a co-author. There is only one open proposal per page.

### Editor

A visual editor (Tiptap) with a **Markdown source** mode that you can switch to
at any time. It offers:

- headings, bold, italic, inline code, links, bullet, numbered and task lists,
  tables (add and delete rows and columns), code blocks, images and
  admonitions, with undo and redo;
- a **front-matter** panel with YAML validation. A proposal cannot be sent while
  the YAML is invalid;
- an optional change message (up to 200 characters) that becomes the commit
  message;
- a warning when you leave the page with unsaved changes;
- a conflict dialog. If the file changed in the meantime the backend answers
  `409`, and the dialog lets you reload the current version or see a diff
  (red is the current version, green is yours).

Images that already exist in the repository are loaded through the backend
(`GET /asset`). New images are kept in memory and sent together with the
proposal; the backend stores them in the assets directory
(`docsStudio.assetsDir`, `attachments` by default). Supported types: PNG, JPEG,
GIF, SVG and WebP, up to `docsStudio.maxAssetSizeMb` each. The backend rejects
SVG files that contain scripts or event handlers.

Creating a page also adds an entry (titled with the page title) to the `nav` of
`mkdocs.yml`, under the section that holds the chosen parent page. This only
happens when `mkdocs.yml` has a `nav`.

### Markdown fidelity

The editor must not rewrite the parts of a page that you did not touch. The
Markdown bridge in `src/markdown/` works like this:

- Pages are parsed with `remark` (CommonMark and GFM, front-matter in YAML or
  TOML) and mapped to the editor document.
- **MkDocs admonitions** (`!!! note "Title"`, `??? type` and `???+ type`, with
  the body indented by four spaces or a tab) are recognised and edited as
  admonitions. Only top-level admonitions are recognised, and the ones inside
  fenced code blocks are ignored.
- **GFM alerts** (`> [!NOTE]`, `TIP`, `IMPORTANT`, `WARNING` and `CAUTION`) are
  recognised and kept as GFM alerts.
- **Raw HTML**, block and inline, is kept as an atomic node that you can edit
  only as raw text and that is written back verbatim.
- Constructs that the editor does not model (for example reference-style
  links, footnotes, task lists mixed with ordinary items) are kept as raw
  nodes instead of being converted.
- **Original-preserving serialization.** Every top-level block remembers its
  original source. A block that was not changed is written back byte for byte,
  with the original spacing between blocks, the front-matter, the trailing text
  and the line endings (LF or CRLF, detected from the file). Only the blocks
  that changed are serialized again. Opening a page and saving it without
  changes produces no diff.

The package includes fixtures and tests for these guarantees
(`src/markdown/__fixtures__`, `bridge.test.ts` and `corpus.test.ts`).

## Licensed and unlicensed users

The backend marks a user as **licensed** when their `User` entity has the
`github.com/user-login` annotation. The frontend never guesses it: it asks
`GET /api/docs-studio/me`.

|                                         | Licensed      | Unlicensed |
| --------------------------------------- | ------------- | ---------- |
| "View on GitHub" link in the addon      | Shown         | Hidden     |
| Native TechDocs "Edit this page" pencil | Left as it is | Hidden     |
| Pull request link in the proposal       | Shown         | Hidden     |

Reading, proposing and approving do not depend on the licence: they depend on
the permissions that the backend evaluates. Licensed developers can also open a
pull request directly in GitHub. The backend sync imports it, so it can be
reviewed and approved in Backstage too.

## Installation

This plugin uses the **new frontend system** and needs:

- the TechDocs frontend plugin (`@backstage/plugin-techdocs`) with addon
  support, because the addons are attached to the TechDocs reader;
- the catalog frontend plugin;
- the backend plugin `@internal/backstage-plugin-docs-studio-backend` installed
  and configured (see its README for the GitHub App, the permissions and the
  ruleset);
- the permission framework enabled (`permission.enabled: true`) and a
  permission policy that handles `docs-studio.proposal.create` and
  `docs-studio.proposal.approve` (see the backend README).

Peer dependencies: `react` 16.13, 17 or 18 and `react-router-dom` ^6.30.2.

1. Add the dependency to your app package:

   ```bash
   yarn --cwd packages/app add @internal/backstage-plugin-docs-studio
   ```

2. Enable the plugin. Choose one option.

   **Feature discovery.** With `app.packages` set to `all` in `app-config.yaml`,
   a plugin that is a dependency of the app package is loaded automatically.
   You can also list the packages explicitly:

   ```yaml
   app:
     packages:
       include:
         - '@internal/backstage-plugin-docs-studio'
   ```

   **Explicit features.** Import the plugin and pass it to `createApp`:

   ```tsx
   import { createApp } from '@backstage/frontend-defaults';
   import docsStudioPlugin from '@internal/backstage-plugin-docs-studio';

   const app = createApp({
     features: [docsStudioPlugin],
   });
   ```

3. Make sure the sidebar of your app shows the new page, if it builds its items
   by hand instead of from the registered pages.

The plugin does not need any frontend configuration. Its options (required
approvals, assets directory and so on) live in the backend, under `docsStudio`.

## Limitations

- **The interface is in Spanish only.** The texts are collected in
  `src/strings.ts` and `src/components/Editor/strings.ts` so they can be moved
  to a translation later, but no translation is available yet.
- The Markdown editor models a subset of Markdown. Everything else is kept
  verbatim as raw text, so it is never lost, but it cannot be edited visually.
- MkDocs admonitions are only recognised at the top level of the page (not
  inside lists or other blocks).
- GFM alerts are not a MkDocs feature. Depending on your TechDocs setup they may
  be rendered as plain blockquotes in the reader.
- The proposal detail shows a line diff only for text files. Binary files
  (images) are listed but not compared, and the detail shows at most 50
  changed files.
- The pages load their data when they open and do not poll. The backend
  refreshes proposals from GitHub in the background, so a change made in GitHub
  can take up to the sync frequency (one minute by default) to appear.
- The toolbar shows the edit and new page buttons to everyone who can open the
  page. If the person has no `docs-studio.proposal.create` permission on the
  entity, the backend refuses the proposal when they submit it.
