# Docs Studio: complete demo guide (from Confluence to TechDocs)

This guide explains how the demo works today and how to reproduce it by hand. It tells the whole story:

1. a Confluence space is migrated to Markdown on GitHub;
2. it is published in Backstage with TechDocs and per-section permissions;
3. people **without a GitHub license** read and propose changes from Backstage;
4. an approver validates the changes, and the result shows up in TechDocs.

Markers used throughout the guide:

- ✅ **Verified:** checked in this environment, with real data.
- ⚠️ **Not verified:** design or deduction, not tested.
- 🎬 / ⏸️: segments to record and waits that are not recorded (see [Recording](#7-recording-segments)).

The end-to-end flow diagram is in [`demo-flow.md`](demo-flow.md).

> **The docs repository.** The demo uses a private docs repository; you cannot read it, so create your own (see [`README.md`](../../README.md) and [`scripts/docs-studio/README.md`](../../scripts/docs-studio/README.md)): generate it with `seed-playground.mjs`, push it as `<owner>/<docs-repo>` and set `DOCS_STUDIO_REPOSITORY=<owner>/<docs-repo>` in `.env`. Throughout this guide, "the docs repository" means that repository.

## Contents

1. [The story in 6 steps](#1-the-story-in-6-steps)
2. [The pieces and how they fit together](#2-the-pieces-and-how-they-fit-together)
3. [Identity, licenses and permissions](#3-identity-licenses-and-permissions)
4. [Requirements and startup](#4-requirements-and-startup)
5. [Manual step-by-step reproduction](#5-manual-step-by-step-reproduction)
6. [What is covered and what is not](#6-what-is-covered-and-what-is-not)
7. [Recording segments](#7-recording-segments)
8. [Troubleshooting and reset](#8-troubleshooting-and-reset)

---

## 1. The story in 6 steps

### 1.1 The Confluence space ✅

- **Where it lives:** a **Confluence Cloud Free plan** site, so no Confluence license has to be bought. It is the `POC` space, whose root page is "Engineering Handbook".
- **How it was filled:** with the `scripts/seed_confluence.py` script from the [`0GiS0/confluence-to-github-poc`](https://github.com/0GiS0/confluence-to-github-poc) repository, which uses the Confluence API.
  - It creates or updates **21 pages** with attachments.
  - If run again, it does not duplicate pages, although Confluence may bump the version of pages that already existed.
- **What the content exercises:** tables, code blocks, panels (_callouts_), links between pages, attachments, an `include` macro and an unknown macro.

### 1.2 Export to Markdown ✅ (⏸️ not recorded)

- **Tool:** [`confluence-markdown-exporter`](https://pypi.org/project/confluence-markdown-exporter/) 5.6.0, run with `scripts/run_export.py` in the same repository. There is no GitHub Actions workflow: it is launched by hand.
- **Configuration** (`config/cme-settings.json`):
  - **Structure:** output goes to `docs/confluence`. Each parent page becomes a folder with a `README.md`, and each leaf becomes `<Title>.md`.
  - **Attachments:** all of them, in `attachments/<id><extension>`.
  - **Links:** relative, both between pages and to attachments.
  - **Macros and comments:** macros are emitted inline; comments are not exported.
  - **Refresh:** the export is complete (`skip_unchanged: false`) and deletes what no longer exists (`cleanup_stale: true`).
- **Variables** (names only): `CONFLUENCE_URL`, `CONFLUENCE_USER`, `CONFLUENCE_API_TOKEN` and `CONFLUENCE_SPACE_KEY`.
- **Validation:** `scripts/validate_export.py` compares the export with the live space. It checks the page inventory, relative links, leftover macros and attachments.
- **Reports** (`reports/` folder of the repository):

  - [`fidelity-matrix.md`](https://github.com/0GiS0/confluence-to-github-poc/blob/main/reports/fidelity-matrix.md) says what is preserved, what is degraded and what is lost:

    | Result    | Elements                                                      |
    | --------- | ------------------------------------------------------------- |
    | Preserved | tables, code, _callouts_, links between pages and attachments |
    | Degraded  | table-of-contents (TOC) anchors and the anchor macro          |
    | Lost      | `include` and the unknown macro                               |

  - [`remediation-report.md`](https://github.com/0GiS0/confluence-to-github-poc/blob/main/reports/remediation-report.md) summarizes the validation and proposes fixes, which are manual:
    - **Result:** 21/21 pages, 2/2 attachments, 86 links checked, 0 broken files and 5 unresolved internal anchors (warnings).
    - **Proposed fixes:** copy the `include` content, replace the unknown macro's placeholder and fix the table-of-contents links.

> ⚠️ The exporter writes `docs/confluence/confluence-lock.json`. It has not been verified whether it is used for incremental exports.

### 1.3 From the corpus to the documentation repository ✅

`scripts/docs-studio/seed-playground.mjs` (in this repository) takes the exported corpus and generates the docs repository (the demo uses a private one; create your own, see [`README.md`](../../README.md)).

```text
<docs-repo>/
├── catalog-info.yaml        Location -> engineering/ and security/
├── engineering/             TechDocs "Engineering Handbook" (without "Security & Compliance")
│   ├── catalog-info.yaml    owner: group:handbook-approvers
│   │                        docs-studio/approvers: group:default/handbook-approvers
│   ├── mkdocs.yml           with explicit nav
│   └── docs/…               pages and attachments/
└── security/                TechDocs "Security Handbook"
    ├── catalog-info.yaml    owner: group:security-team
    │                        docs-studio/visibility: restricted
    ├── mkdocs.yml
    └── docs/…
```

- **Links between sections:**
  - from `engineering` to `security`: become plain text with a "(restricted)" mark;
  - from `security` to `engineering`: become absolute TechDocs paths;
  - **all the others:** are rewritten so they keep working.
- **Link report:** the script prints it when it finishes and exits with code 1 if any link is still broken.
- **GitHub:** by default it only generates a local directory. With `--push <owner/repo> --apply` it also pushes.
- **Registration in Backstage:** `app-config.yaml` has a `url` location pointing to the root `catalog-info.yaml` of the docs repository (set with `DOCS_STUDIO_REPOSITORY`), so both the `engineering-handbook` and `security-handbook` entities appear in the catalog.

### 1.4 Dedicated docs repository or `docs/` next to the code?

| Option                       | What it is                                                                                                                                                           | Demonstrated?                                              |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| **Dedicated repository**     | A documentation-only repository, with one or several TechDocs sites                                                                                                  | ✅ **Yes.** It is what the demo does (the docs repository) |
| **`docs/` next to the code** | In the service repository: `mkdocs.yml` + `docs/` + `catalog-info.yaml` with `backstage.io/techdocs-ref: dir:.`. The documentation lives in the service's own entity | ❌ **No.** Not tested                                      |

For the "next to the code" option to work (⚠️ all unverified):

1. Add the repository to `docsStudio.allowedRepositories` and have the GitHub App installed on it.
2. The ruleset with the required `docs-studio/approval` status would affect **all** PRs in the repository, code PRs included: a required status check cannot be limited to a path. There are two ways out:
   - the App publishes `success` on PRs that do not touch `docs/`;
   - do not require the status in that repository and approve only in Backstage, which removes the guarantee that the App has no _bypass_.

This is the most important design decision if the customer wants the documentation next to their code.

### 1.5 Permissions in two layers ✅

| Layer                               | What it controls                              | Verified behavior                                                                                                                                                                                                                                                     |
| ----------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Backstage** (permission policy)   | Catalog, TechDocs, search, chat and proposals | Entities with `docs-studio/visibility: restricted` can only be read by their owners:<br>• Sansa (`security-team`) sees the Security Handbook in the catalog, TechDocs and search ("vault").<br>• Arya and Jon get a **404** and their "vault" search returns nothing. |
| **GitHub** (repository permissions) | Who reads the files on github.com             | `security/` is in the **same repository** as `engineering/` and the organization's base permission is _read_. That is why **Jon (licensed) reads `security/docs/Secrets Management.md` on GitHub** (in 7.4 s).                                                        |

The implications:

- **Unlicensed people:** have no GitHub access, so Backstage is their only door and the restriction holds.
- **Licensed people:** the Backstage restriction is only as strong as the repository permissions on GitHub.

**Recommendation:** put restricted content in a **separate repository** that only the owning team can read (or, at the very least, change the organization's base permission). It is registered in the catalog the same way, with the same annotation.

> ⚠️ The chat receives a token issued on behalf of the person, so the same policy applies to its tools. It has not been tested with Sansa because chat is disabled for her.

### 1.6 Licensed and unlicensed flow ✅

Unlicensed people (Arya and Sansa) read and propose from Backstage:

1. **The proposal is a PR.** The GitHub App creates the branch, the commit and the PR. Arya appears as the **commit author** and the App as the _committer_.
2. **Approval.** An approver (Samwell, licensed) approves in Backstage. The App publishes the `docs-studio/approval` status and merges the PR.
3. **TechDocs.** TechDocs rebuilds the site and the change appears.

Licensed people (Jon) have two paths:

- **From Backstage:** the same as Arya.
- **Directly on GitHub:** their PR is **blocked** by the ruleset until someone approves it in Backstage.

In both cases there is a single approval process.

---

## 2. The pieces and how they fit together

| Piece                                                 | What it does                                                                                                                                                                                                                                                          | Where                                                                           |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **Backstage** (1.56)                                  | Internal portal: catalog, TechDocs, search and chat                                                                                                                                                                                                                   | `packages/app`, `packages/backend`                                              |
| **TechDocs**                                          | Generates each entity's MkDocs site and serves it. Locally it uses `mkdocs` from a Python _venv_, no Docker                                                                                                                                                           | `techdocs.*` in `app-config.yaml`                                               |
| **Docs Studio (frontend)**                            | "Edit this page", "New page" and "View on GitHub" buttons in TechDocs, WYSIWYG editor (Tiptap), pending-changes notice, proposal list and detail                                                                                                                      | [`plugins/docs-studio`](../../plugins/docs-studio/README.md)                    |
| **Docs Studio (backend)**                             | REST API, GitHub App (branches, commits, PRs, statuses and merge), one-proposal-per-page rule, co-authorship, conflicts (409), approval and synchronization                                                                                                           | [`plugins/docs-studio-backend`](../../plugins/docs-studio-backend/README.md)    |
| **Docs Studio (common)**                              | Permissions (`docs-studio.proposal.create`, `docs-studio.proposal.approve`), annotations and types                                                                                                                                                                    | [`plugins/docs-studio-common`](../../plugins/docs-studio-common/README.md)      |
| **Permission policy**                                 | Restricted-visibility rule and who approves. It lives in the application, not in the plugin                                                                                                                                                                           | [`docsStudioPolicy.ts`](../../packages/backend/src/modules/docsStudioPolicy.ts) |
| **SQLite**                                            | Proposals, authors and approvals. Survives restarts                                                                                                                                                                                                                   | `.docs-studio-data/docs-studio.sqlite` (ignored by git)                         |
| **Synchronization**                                   | Every minute it refreshes the status of proposals and **imports PRs opened directly on GitHub**. There are no _webhooks_ locally                                                                                                                                      | Docs Studio backend (`docsStudio.sync`)                                         |
| **GitHub App** "Docs Studio (local)"                  | Creates the branches, commits and PRs, publishes the `docs-studio/approval` status and merges (with a _merge commit_). Its credentials are in `github-app-docs-studio-credentials.yaml` (ignored by git)                                                              | created with `scripts/docs-studio/create-github-app.mjs`                        |
| **Docs repository**                                   | `<owner>/<docs-repo>` (set with `DOCS_STUDIO_REPOSITORY`): private, `main` branch, with two TechDocs sites. The demo uses a private one; create your own, see [`README.md`](../../README.md)                                                                          | generated with `seed-playground.mjs`                                            |
| **Ruleset** "Docs Studio approval"                    | Protects `main`: requires a PR, requires the `docs-studio/approval` status published **only by the App** (`integration_id`) and blocks _force-push_ and deletion. **No _bypass_**                                                                                     | `scripts/docs-studio/apply-ruleset.mjs`                                         |
| **Allowed repositories list**                         | `docsStudio.allowedRepositories`. Today it only includes the docs repository. The App is installed on **all** repositories of the organization (a deliberate decision for the demo), but Docs Studio only acts on those in this list                                  | `app-config.yaml`                                                               |
| **Entra application** "Backstage Docs Studio (local)" | Backstage sign-in with Microsoft. It recognizes each person by their Entra id (`graph.microsoft.com/user-id`) or by their email; without a `User` entity in the catalog you cannot sign in                                                                            | `auth.providers.microsoft`                                                      |
| **GitHub EMU + OIDC**                                 | The licensed GitHub accounts (Jon, Samwell) are _managed users_ of the EMU enterprise, which sign in to GitHub through Entra (OIDC)                                                                                                                                   | enterprise configuration                                                        |
| **Copilot Chat + OAuth App** "backstage-demo"         | The chat uses the person's GitHub token (with their Copilot license). The person connects GitHub only once (EMU OIDC → "Authorize backstage-demo"). The chat tools (MCP actions) are called with a token issued on behalf of that person, so they respect permissions | `plugins/copilot-chat*`, `auth.providers.github`                                |

---

## 3. Identity, licenses and permissions

### 3.1 People matrix ✅

The real identities (Entra ids, emails and GitHub users) are in `examples/docs-studio/org.local.yaml`, which is in `.gitignore`. They are never pushed to the repository.

|                                         | Arya Stark        | Sansa Stark                              | Jon Snow                                 | Samwell Tarly                         | guest                                 |
| --------------------------------------- | ----------------- | ---------------------------------------- | ---------------------------------------- | ------------------------------------- | ------------------------------------- |
| GHEC (EMU) license                      | ❌                | ❌                                       | ✅ (+ Copilot)                           | ✅                                    | —                                     |
| Group                                   | `engineering`     | `security-team`                          | `engineering`                            | `handbook-approvers`                  | —                                     |
| Backstage sign-in                       | Microsoft (Entra) | Microsoft (Entra)                        | Microsoft (Entra)                        | Microsoft (Entra)                     | Guest                                 |
| Read the Engineering Handbook           | ✅                | ✅                                       | ✅                                       | ✅                                    | ✅                                    |
| Read the Security Handbook in Backstage | ❌ 404            | ✅                                       | ❌ 404                                   | ❌ (⚠️ not tested)                    | ❌ (⚠️ not tested)                    |
| Read `security/` on GitHub              | no account        | no account                               | ⚠️ **yes** (base _read_ permission)      | ⚠️ yes, by the same rule (not tested) | —                                     |
| Edit or create from Backstage           | ✅                | ⚠️ in the Security Handbook (not tested) | ✅                                       | ⚠️ (not tested)                       | ❌ (⚠️ the buttons are still visible) |
| Edit or create from GitHub              | ❌                | ❌                                       | ✅ (the PR is imported into Docs Studio) | ⚠️ (not tested)                       | ❌                                    |
| Approve                                 | ❌                | ❌                                       | ❌                                       | ✅ (Engineering Handbook)             | ❌                                    |
| Copilot Chat                            | ❌ disabled       | ❌ disabled                              | ✅                                       | ⚠️ has not connected GitHub           | ❌                                    |

### 3.2 How we know who is licensed

- **Rule:** the catalog `User` entity of a licensed person carries the `github.com/user-login` annotation; unlicensed people do not.
- **What it is used for:** Docs Studio and the chat use that annotation to decide whether to show "View on GitHub" and whether to enable the chat.
- ⚠️ It is a catalog declaration, **not a live check** against GitHub or the Copilot API.
- In the EMU enterprise, "unlicensed" in practice means that the person is **not assigned to the GitHub enterprise application in Entra**, so they have no GitHub account. This holds for Arya and Sansa: they have no account.

### 3.3 How authorship works without a GitHub account ✅

Verified on PRs #1 and #3 of the docs repository:

- **PR author on GitHub:** `app/docs-studio-local`, the App.
- **Commits:**
  - `author`: the Backstage person's name and Entra email (for example `Arya Stark <…@….onmicrosoft.com>`). Without a GitHub account, the commit links to no profile.
  - `committer`: `docs-studio-local[bot]`.
  - If Jon later edits the same page, his commit carries the `Co-authored-by: Arya Stark <…>` trailer and his author is his EMU user.
- **PR body:** a "Review this proposal in Backstage" link, the list of authors and a hidden `<!-- docs-studio:metadata … -->` block. That block stores the authors, whether each one is licensed or not, and the approvals with the approved SHA.
- **Signing:** commits created by the App with a custom author are **unsigned** (`verification.reason = unsigned`). Commits Jon makes in GitHub's web editor are **Verified**.

### 3.4 Approval

- **Who can approve:** anyone with the `docs-studio.proposal.approve` permission. Entity owners and the people or groups in the `docs-studio/approvers` annotation have it.
- **Four eyes:** nobody approves their own proposal.
- **The GitHub status:** on approval, the App publishes `docs-studio/approval: success` ("Approved by …") on the **head SHA**. If the branch moves forward, the approval stops being valid.
- **Automatic merge:** with `autoMergeOnApproval: true`, the App merges as soon as the approval arrives (with a _merge commit_), so no "Publish" button appears. With `false`, the approver would have to publish by hand.
- ⚠️ **Not verified:** approval by an unlicensed person. No unlicensed person is in `handbook-approvers`; by design, the permission depends on the catalog group, not on the license.

---

## 4. Requirements and startup

### 4.1 Requirements

- **Tools:** Node 22 or 24, Yarn 4 (see `package.json`), `gh`, a Python _venv_ with `mkdocs` and `mkdocs-techdocs-core` (by default `~/.venvs/techdocs`, configurable with `TECHDOCS_VENV`), and Chrome or Edge (Safari does not work on `http://localhost`, see section 8). If your network requires a package proxy, configure it for yarn/pip.
- **Local files, all ignored by git:**

  | File                                      | Contents                                                                                                                                                                                                                    |
  | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `.env`                                    | Variables `GITHUB_TOKEN`, `AUTH_GITHUB_CLIENT_ID`, `AUTH_GITHUB_CLIENT_SECRET`, `AUTH_MICROSOFT_CLIENT_ID`, `AUTH_MICROSOFT_CLIENT_SECRET`, `AUTH_MICROSOFT_TENANT_ID` and `DOCS_STUDIO_REPOSITORY` (`<owner>/<docs-repo>`) |
  | `app-config.local.yaml`                   | Copy of `app-config.local.example.yaml`: the `integrations.github` block with the App                                                                                                                                       |
  | `github-app-docs-studio-credentials.yaml` | App credentials                                                                                                                                                                                                             |
  | `examples/docs-studio/org.local.yaml`     | Real people and groups (created by `scripts/start.sh` from `org.example.yaml` if it does not exist)                                                                                                                         |

- **Setting up from scratch** (GitHub App, repository, ruleset and Entra): the steps are in [`scripts/docs-studio/README.md`](../../scripts/docs-studio/README.md). Scripts that change something are _dry-run_ by default and need `--apply`. See also the main [`README.md`](../../README.md).

### 4.2 Starting up

```bash
./scripts/start.sh 2>&1 | tee /tmp/docs-studio-backstage.log
```

- **What it does:** loads `.env`, adds the TechDocs _venv_ to the `PATH` and launches `yarn start`.
- **Ports:** frontend at `http://localhost:3000` and backend at `:7007`.
- **Search:** the search index lives in memory and takes about a minute to fill.

### 4.3 People's sessions

- **By hand:** use **one browser profile per person** (Chrome or Edge profiles, or separate InPrivate windows). This way the Entra cookies do not get mixed. In each profile, "Sign in with Microsoft" and choose the right account in the Entra picker.
- **Automated tests** reuse Chrome profiles stored **outside the repository**, in the agent session folder (`files/persona-profiles/<persona>`). They do not store passwords. The passwords were typed by hand by the user and nobody else.

---

## 5. Manual step-by-step reproduction

Before starting, Backstage must be running, with one browser profile per person. To verify on GitHub you need an account with access to the docs repository. The times and clicks are those of the automated test.

### Arya (unlicensed, `engineering`)

| #   | Step                                                                                            | Expected result                                                                                                                                        | Where to verify it                                                                                                                                                                     |
| --- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | Open `http://localhost:3000` → **Sign in with Microsoft** → Arya's account                      | Enters Backstage. On first sign-in, Entra asked to **change the password**                                                                             | Settings → "Arya Stark" profile                                                                                                                                                        |
| A2  | **Docs** → "Engineering Handbook" → Platform Operations → Deployment Guide → Rollback Procedure | Reads the page. The bar shows "Edit this page" and "New page", but **not** "View on GitHub" (20.5 s, 3 clicks)                                         | —                                                                                                                                                                                      |
| A3  | The **Docs** index and the direct URL `/docs/default/component/security-handbook`               | The Security Handbook does not appear in the index and the direct URL gives **ERROR 404**. Searching "vault" does not return it                        | —                                                                                                                                                                                      |
| A4  | Onboarding → Team Glossary → **Edit this page** → add a sentence → **Propose changes**          | The proposal appears, "Open · Awaiting approval", and the page shows the notice "Changes to this page are pending review" (38.6 s, 7 clicks, 2 fields) | On GitHub: new PR from `app/docs-studio-local` on a `docs-studio/…` branch; commit authored by Arya with committer `docs-studio-local[bot]`; `docs-studio/approval` status **pending** |
| A5  | **New page** → title, section and text → **Propose page**                                       | New creation proposal (39.7 s, 6 clicks, 2 fields)                                                                                                     | In the PR: the new `.md` **and** the new entry in the `nav` of `mkdocs.yml`                                                                                                            |
| A6  | **Docs Studio** → "My proposals"                                                                | List with the status of each proposal                                                                                                                  | —                                                                                                                                                                                      |
| A7  | **Copilot Chat**                                                                                | "Chat requires a GitHub Copilot license. Ask your administrator for access." (10.8 s)                                                                  | —                                                                                                                                                                                      |
| A8  | (Optional) Open one of their own proposals → **Discard**                                        | The App closes the PR and deletes the branch (14.3 s, 2 clicks)                                                                                        | The PR shows as _Closed_ (like #2)                                                                                                                                                     |

### Sansa (unlicensed, `security-team`)

| #   | Step                                    | Expected result                                                    |
| --- | --------------------------------------- | ------------------------------------------------------------------ |
| S1  | Sign in with Microsoft with her account | Same as Arya, including the password change on first sign-in       |
| S2  | **Docs**                                | Sees **two** sites: Engineering Handbook and **Security Handbook** |
| S3  | Security Handbook → Secrets Management  | Reads the restricted content (25.8 s, 4 clicks)                    |
| S4  | Search "vault"                          | The restricted page appears                                        |
| S5  | Copilot Chat                            | Disabled, with the same message as Arya                            |

### Jon (licensed, `engineering`)

| #   | Step                                                                                                                                                         | Expected result                                                                                                             | Where to verify it                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| J1  | Sign in with Microsoft with his account                                                                                                                      | Enters without a password change                                                                                            | —                                                                                                                      |
| J2  | Read a page                                                                                                                                                  | Same as Arya, but with the "View on GitHub" button                                                                          | —                                                                                                                      |
| J3  | Direct URL of the Security Handbook                                                                                                                          | **404** in Backstage                                                                                                        | On github.com he can open `security/docs/Secrets Management.md` (see section 1.5)                                      |
| J4  | Edit the same page Arya has open → **Propose changes**                                                                                                       | He **joins** Arya's proposal as co-author (38 s)                                                                            | New commit on the same PR with the `Co-authored-by: Arya Stark` trailer and both authors in the body                   |
| J5  | **View on GitHub** → pencil → edit → **Commit changes…** → new branch → **Propose changes** → **Create pull request**                                        | Native PR (51 s, 9 clicks). On GitHub it shows as **blocked** because the required `docs-studio/approval` status is missing | Within 10–60 s it appears in Docs Studio as "Imported from GitHub"; the App publishes the status **pending "(0/1)"**   |
| J6  | On GitHub: **Add file → Create new file** → PR                                                                                                               | Native new-page PR (26.4 s), imported the same way                                                                          | ⚠️ It does **not** add the entry to the `nav` of `mkdocs.yml`: after the merge, the page only opens via its direct URL |
| J7  | **Copilot Chat** → the first time, connect GitHub (EMU OIDC → Entra picker → "Authorize backstage-demo", about 52 s) → ask "What is the rollback procedure?" | Answer with `kubectl rollout undo` citing the Rollback Procedure page as a source (arrives in 17 s; 27.2 s in total)        | —                                                                                                                      |

### Samwell (licensed, `handbook-approvers`)

| #   | Step                                               | Expected result                                                                                                                        | Where to verify it                                                                                                                               |
| --- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| W1  | Sign in with Microsoft with his account            | Enters                                                                                                                                 | —                                                                                                                                                |
| W2  | **Docs Studio** → "Awaiting my approval"           | Arya's and Jon's proposals, including the imported native PRs                                                                          | —                                                                                                                                                |
| W3  | Open a proposal → review the changes → **Approve** | The proposal moves to **"Published"** right away (about 29 s, 4 clicks). No "Publish" button appears because the App merges on its own | In the PR: `docs-studio/approval` status **success**, "Approved by Samwell Tarly"; _Merged by_ `app/docs-studio-local`; _merge commit_ on `main` |

### Anyone: see the change in TechDocs

| #   | Step                                        | Expected result                                                                                                                                                |
| --- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | Go back to the changed page after the merge | The new text is visible on the first visit (about 24 s, 4 clicks, with the local generator). If not, reload: TechDocs checks for changes and rebuilds the site |
| T2  | The page created from Docs Studio           | Appears in the menu of its section ("Useful Links" in Onboarding, PR #3)                                                                                       |
| T3  | The page created from GitHub (J6)           | Does not show in the menu; it only opens via its URL (`team-rituals.md`, PR #5)                                                                                |

---

## 6. What is covered and what is not

| Topic                                                                                                                     | Status                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Reading with per-entity permissions in Backstage (catalog, TechDocs and search)                                           | ✅ covered and verified                                                                                             |
| Equivalent restriction on GitHub                                                                                          | ❌ **no**: same repository and base _read_ permission. Recommendation: separate repository                          |
| WYSIWYG editor with faithful round-trip of MkDocs Markdown (front matter, admonitions, tables, images and links)          | ✅ with tests on the real corpus                                                                                    |
| Proposal = App branch + PR; authorship by the person; co-authorship; one proposal per page                                | ✅                                                                                                                  |
| Conflicts (409)                                                                                                           | ✅ detected, with dialog and diff. ⚠️ To resolve them you must reload and **the edit is lost**                      |
| Creating pages (with an entry in the `nav`)                                                                               | ✅                                                                                                                  |
| Approval in Backstage + required status with no _bypass_ + automatic merge                                                | ✅                                                                                                                  |
| Importing native GitHub PRs into the same approval flow                                                                   | ✅                                                                                                                  |
| TechDocs updated after the merge                                                                                          | ✅                                                                                                                  |
| Chat for licensed people, with the page cited                                                                             | ✅                                                                                                                  |
| Chat for unlicensed people (**BYOK**)                                                                                     | ❌ not implemented: the chat shows as disabled                                                                      |
| SharePoint as a source                                                                                                    | ❌ out of scope                                                                                                     |
| Real-time co-editing and inline comments                                                                                  | ❌ out of scope                                                                                                     |
| `docs/` next to the code in a service repository                                                                          | ❌ not demonstrated (see section 1.4)                                                                               |
| Production: high availability, _webhooks_ instead of 1-minute _polling_, a real database, managed secrets, commit signing | ❌ not done                                                                                                         |
| App installed on **all** repositories of the organization                                                                 | Deliberate decision for the demo. Docs Studio only acts on `allowedRepositories`                                    |
| EMU enterprise policy on OAuth Apps                                                                                       | ✅ today Jon can authorize "backstage-demo". ⚠️ If the enterprise restricts OAuth Apps, the chat would stop working |

### Known limitations

- **GitHub sign-in:** has `dangerouslyAllowSignInWithoutUserInCatalog` enabled (PoC only).
- **Buttons not filtered by permission:** "Edit this page" and "New page" are visible even without permission; the backend rejects the action.
- **Attachments:** the limit of 10 attachments per proposal is not enforced yet.
- **Status delay:** up to 1 minute (_polling_ synchronization).
- **GFM alerts** (`> [!NOTE]`): shown as blockquotes in TechDocs.
- **PR #3:** its title came out in Spanish ("docs: añade "…"") because the Docs Studio interface was in Spanish at the time. It is now in English and the default message is `docs: add "…"`.
- **PR #1:** keeps the old title "docs: docs: …", from before the fix.
- **Passwords:** Arya's and Sansa's were changed at their first sign-in.

---

## 7. Recording segments

The recording is split into **4 short videos** (MP4 1920×1080, `github-dark` theme, text in English). 🎬 marks what is recorded and ⏸️ the waits, which are replaced by a card.

| Demo                       | 🎬 Recorded                                                                                                                                                                                                   | ⏸️ Not recorded                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **1. Migration**           | The `POC` space in Confluence (page tree, a page with a table, macros and an attachment). Then, on GitHub, the exported Markdown in `docs/confluence/…`, the attachments and the two reports                  | Running `run_export.py` and `validate_export.py` ("Exporting the space · Not recorded" card)    |
| **2. Permissions**         | Sansa sees the Security Handbook and finds it by searching "vault". Arya gets a 404 and does not find it                                                                                                      | Switching profiles between people                                                               |
| **3. Unlicensed proposal** | Arya edits and proposes → the PR on GitHub (author `app/docs-studio-local`, commit with Arya as author and _pending_ status) → Samwell approves in Backstage → the PR ends up merged → the change in TechDocs | The synchronization and the **TechDocs rebuild** ("TechDocs is rebuilding · Not recorded" card) |
| **4. Chat**                | Jon asks and gets the answer with the cited page. Arya sees the chat disabled                                                                                                                                 | Jon's initial GitHub connection (already done)                                                  |

Each recording of demo 3 creates a real PR and a merge into `main` of the docs repository (see section 8.3).

---

## 8. Troubleshooting and reset

### 8.1 Common problems

| Symptom                                              | Cause                                                     | Solution                                                                                    |
| ---------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Entra signs in as someone else                       | The account picker reuses the profile's session           | One browser profile per person. In the picker, "Use another account" and type the exact UPN |
| "Update your password" on first sign-in              | Tenant policy for new users                               | The person chooses a new password (expected behavior)                                       |
| Cannot sign in with Microsoft                        | There is no matching `User` entity (Entra id or email)    | Check `examples/docs-studio/org.local.yaml` and restart or wait for the catalog to refresh  |
| TechDocs keeps loading in Safari                     | The `Secure` cookie is not accepted on `http://localhost` | Use Chrome or Edge                                                                          |
| No "Publish" button after approving                  | Expected: `autoMergeOnApproval: true`                     | Check on GitHub that the PR is _Merged_                                                     |
| The native PR does not appear in Docs Studio         | Synchronization runs every minute                         | Wait up to 1 minute and look for "Imported pull request #N" in the log                      |
| The page created on GitHub does not show in the menu | `mkdocs.yml` has an explicit `nav`                        | Add the entry to the `nav` (or create the page from Docs Studio)                            |
| "The page has changed" (409) when proposing          | Someone else changed the file after you opened it         | Review the differences, reload and reapply the change (the unsent edit is lost)             |
| The chat asks to connect GitHub                      | It is the first time or the token has expired             | Connect → EMU OIDC → "Authorize backstage-demo"                                             |
| Search returns nothing right after startup           | The in-memory index is not full yet                       | Wait about a minute                                                                         |

### 8.2 Restarting Backstage and proposals

- **Stop and start:** `Ctrl+C` in the `start.sh` terminal and `./scripts/start.sh` again. Proposals are kept, because they are in SQLite.
- **Start with an empty Docs Studio** (⚠️ not tested): first close the open PRs, stop Backstage and delete `.docs-studio-data/docs-studio.sqlite`. PRs still open on GitHub would be imported again on the next synchronization.

### 8.3 Returning the docs repository to its initial state

`main` is protected by the ruleset: it needs a PR, does not allow _force-push_ and has no _bypass_. That is why you cannot "rewind" by pushing directly, and `seed-playground.mjs` has no reset mode. The supported way is to revert through PRs (⚠️ not tested yet):

1. **Revert via PR (recommended, respects the rules).** On each merged PR, a licensed person clicks **Revert** on GitHub. Docs Studio imports the revert PR, Samwell approves it in Backstage and the App merges it.

   - Afterwards the Docs Studio database must be emptied (see section 8.2).

2. **Start over completely.** Delete the docs repository, create a new empty one and run `seed-playground.mjs … --push … --apply` again (the seed script cannot push over an existing `main`). Then restore access and rules (if the new repository has a different name, also update `DOCS_STUDIO_REPOSITORY` in `.env` before restarting Backstage, because the catalog URL and the allow-list use it): install the GitHub App on the new repository, grant the token access to it, re-apply the ruleset if you use one (see `scripts/docs-studio/README.md`), and empty the Docs Studio database (section 8.2). This last step is required when the repository name is reused, because stored proposals would otherwise hide new PRs with the same numbers.

PRs created so far in the demo's docs repository (all real):

| PR  | What                                                   | Status |
| --- | ------------------------------------------------------ | ------ |
| #1  | Arya edits Team Glossary; Jon joins as co-author       | Merged |
| #2  | New page by Arya, discarded                            | Closed |
| #3  | Arya creates "Useful Links"; Jon edits it              | Merged |
| #4  | Jon edits First Week Checklist on GitHub               | Merged |
| #5  | Jon creates `team-rituals.md` on GitHub (off the menu) | Merged |

---

## Comparison verdict

The full comparison between licensed and unlicensed people, with screenshots and metrics, was done in English for the customer. In short:

- **Worth it** as a **read and propose** path for occasional contributors without a license:
  - Arya does the same as Jon in Docs Studio with the same time and clicks (38.6 s versus 38 s when editing), without a GitHub license and without knowing Markdown;
  - creating pages is safer than on GitHub, because Docs Studio adds the entry to the `nav`;
  - all changes, whether they come from Backstage or from GitHub, go through the same approval.
- **Does not replace** the developers' flow: for them, editing in Docs Studio is only somewhat faster than in GitHub's web editor (38 s versus 51 s).
- **Costs to accept:**
  - restricted content needs its own repository;
  - without BYOK, unlicensed people have no chat;
  - the App's commits with the person as author are unsigned, which does not fit if the organization requires signed commits;
  - the deployment still needs hardening for production.
