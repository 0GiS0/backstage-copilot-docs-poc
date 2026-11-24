# Docs Studio: setup scripts

Scripts to set up the Docs Studio environment. Those that **change something**
(GitHub or local) are _dry-run_ by default and need `--apply`. None of them prints
secrets. All of them accept `--help`.

| Script                      | Changes anything?                                                               | Explicit confirmation |
| --------------------------- | ------------------------------------------------------------------------------- | --------------------- |
| `list-entra-unlicensed.mjs` | No (read-only, `az` + Graph)                                                    | No                    |
| `seed-playground.mjs`       | Local only (generates a directory). With `--push … --apply` it pushes to GitHub | For `--push --apply`  |
| `create-github-app.mjs`     | Creates a GitHub App in the organization (with `--apply`)                       | **Yes**               |
| `apply-ruleset.mjs`         | Creates/updates a repo ruleset (with `--apply`)                                 | **Yes**               |

## Recommended order

1. **Identify unlicensed users** (optional, read-only): `az login --tenant <tenant> --allow-no-subscriptions`
   and `node scripts/docs-studio/list-entra-unlicensed.mjs`. Use the output to fill in
   `examples/docs-studio/org.local.yaml` (`id` → `graph.microsoft.com/user-id`,
   `mail` or, if empty, `userPrincipalName` → `spec.profile.email`).
2. **Generate the docs repository content**:
   `node scripts/docs-studio/seed-playground.mjs --out ./playground-seed`
   (review the link report; it exits with code 1 if there are broken links).
3. **Create the docs repository** (private, empty, manually on GitHub) as `<org>/<docs-repo>`
   and push the content by regenerating it in one go:
   `node scripts/docs-studio/seed-playground.mjs --out ./playground-seed --force --push <org>/<docs-repo> --apply`
   (`--force` only deletes the local output directory; the script runs `git init`, commits
   and pushes). Pushing needs an authenticated `gh` session and a Git author name and email.
4. **Create the GitHub App**: `node scripts/docs-studio/create-github-app.mjs --org <your-org> --apply`.
   It writes `github-app-docs-studio-credentials.yaml` (ignored by git, mode 0600).
   Then install it **only** on the docs repository (URL printed by the script).
5. **Apply the ruleset** with the App id:
   `node scripts/docs-studio/apply-ruleset.mjs --repo <org>/<docs-repo> --app-id <id> --apply`
   (run a dry-run first without `--apply` to review the JSON). **Optional:** private
   organization repositories need GitHub Team or Enterprise Cloud for rulesets. Without a
   ruleset, PRs opened directly on GitHub are not blocked.
6. **Configure Backstage**: create `app-config.local.yaml` from
   `app-config.local.example.yaml` only if it does not exist yet, fill in `.env` (`GITHUB_TOKEN`, `AUTH_MICROSOFT_*`, and
   `DOCS_STUDIO_REPOSITORY=<org>/<docs-repo>`) and edit
   `examples/docs-studio/org.local.yaml`; start with `scripts/start.sh`.

## Notes

- `apply-ruleset.mjs` uses your `gh` session (or `GH_TOKEN`) and requires admin
  permissions on the repo.
- The `docs-studio/approval` status can only be published by the App, which is why
  the ruleset requires it with its `integration_id`.
- The scripts need no new dependencies (Node 22 or 24, `gh`, `az`, and the `yaml`
  package already installed in the repo).
