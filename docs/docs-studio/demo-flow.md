# Docs Studio: end-to-end demo flow

This diagram accompanies the [demo guide](demo-guide.md). It shows how content moves from Confluence to TechDocs and how a proposal travels from an unlicensed person to publication.

```mermaid
flowchart TB
    subgraph M["1 · Migration (once)"]
        direction LR
        CF["Confluence space<br/>(Cloud Free, 21 pages)"] --> EX["Markdown export<br/>+ fidelity reports"] --> SEED["seed-playground.mjs<br/>engineering/ + security/"]
    end
    REPO[("docs repository<br/>(GitHub)")]
    subgraph L["2 · Reading in Backstage"]
        direction LR
        CAT["Catalog + TechDocs"] --> POL{"Permission<br/>policy"} --> READ["Read and search<br/>(security: security-team only)"]
    end
    subgraph P["3 · Proposal and publication"]
        direction LR
        EDIT["Arya, unlicensed,<br/>edits in Docs Studio"] --> APP["GitHub App<br/>branch + commit + PR"] --> PR["PR authored by Arya<br/>pending status"]
        NATIVE["Jon, licensed,<br/>direct PR on GitHub"] -->|imported| PR
        PR --> APPROVE["Samwell approves<br/>in Backstage"] --> CHECK["docs-studio/approval<br/>success + merge"]
    end
    BUILD["TechDocs rebuilds"]

    SEED --> REPO --> CAT
    POL --> EDIT
    CHECK --> REPO
    CHECK --> BUILD --> CAT
```

## How to read it

- **1 · Migration** (`CF → EX → SEED → REPO`): happens only once. The export is not recorded.
- **2 · Reading** (`CAT → POL → READ`): the Backstage policy hides restricted entities. On GitHub, the restriction depends on the repository permissions (see section 1.5 of the guide).
- **3 · Proposal** (`EDIT → APP → PR`): the App does the work on GitHub on behalf of a person who has no account.
- **Native PRs** (`NATIVE → PR`): they enter the same flow; the ruleset blocks them until approval.
- **Publication** (`APPROVE → CHECK → REPO → BUILD`): only the App can publish the required status, and the App has no _bypass_.
