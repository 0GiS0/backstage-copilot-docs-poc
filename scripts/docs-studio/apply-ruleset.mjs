#!/usr/bin/env node
// Applies the Docs Studio repository ruleset (PR required + docs-studio/approval
// status check from the Docs Studio GitHub App). Dry-run by default.
import { fail, parseCli, run } from './lib.mjs';

const HELP = `Usage: node scripts/docs-studio/apply-ruleset.mjs --repo <owner/name> --app-id <id> [options]

Builds a repository ruleset for the default (or given) branch:
  - pull_request (0 required approvals: approval happens in Docs Studio)
  - required status check "docs-studio/approval" from the Docs Studio App
  - non_fast_forward, deletion
  - no bypass actors, enforcement active

Options:
  --repo <owner/name>  Target repository (required).
  --app-id <id>        GitHub App id that publishes the status (required).
  --branch <name>      Branch to protect. Default: main.
  --name <name>        Ruleset name. Default: "Docs Studio approval".
  --context <ctx>      Status context. Default: docs-studio/approval.
  --apply              Create or update the ruleset through \`gh api\`.
                       WITHOUT it this is a dry-run that prints the JSON.
  -h, --help           Show this help.

Authentication: uses your \`gh\` login, or GH_TOKEN if set. Needs admin rights on
the repository. If a ruleset with the same name exists it is updated (PUT).`;

const args = parseCli(
  {
    repo: { type: 'string' },
    'app-id': { type: 'string' },
    branch: { type: 'string' },
    name: { type: 'string' },
    context: { type: 'string' },
    apply: { type: 'boolean' },
  },
  HELP,
);

if (!args.repo || !/^[\w.-]+\/[\w.-]+$/.test(args.repo)) {
  fail('--repo <owner/name> is required (see --help).');
}
if (!args['app-id'] || !/^\d+$/.test(args['app-id'])) {
  fail('--app-id <numeric id> is required (see --help).');
}

const branch = args.branch ?? 'main';
const name = args.name ?? 'Docs Studio approval';
const ruleset = {
  name,
  target: 'branch',
  enforcement: 'active',
  conditions: { ref_name: { include: [`refs/heads/${branch}`], exclude: [] } },
  bypass_actors: [],
  rules: [
    {
      type: 'pull_request',
      parameters: {
        required_approving_review_count: 0,
        dismiss_stale_reviews_on_push: false,
        require_code_owner_review: false,
        require_last_push_approval: false,
        required_review_thread_resolution: false,
      },
    },
    {
      type: 'required_status_checks',
      parameters: {
        strict_required_status_checks_policy: false,
        required_status_checks: [
          {
            context: args.context ?? 'docs-studio/approval',
            integration_id: Number(args['app-id']),
          },
        ],
      },
    },
    { type: 'non_fast_forward' },
    { type: 'deletion' },
  ],
};

const body = JSON.stringify(ruleset, null, 2);
if (!args.apply) {
  console.log(
    `[dry-run] Ruleset for ${args.repo} (nothing was sent to GitHub):\n`,
  );
  console.log(body);
  console.log('\nRe-run with --apply to create or update it.');
  process.exit(0);
}

const gh = (ghArgs, input) => run('gh', ghArgs, { input });
const list = gh(['api', `repos/${args.repo}/rulesets`, '--paginate']);
if (list.status !== 0) fail(`Could not list rulesets: ${list.stderr.trim()}`);
const existing = JSON.parse(list.stdout || '[]').find(r => r.name === name);

const endpoint = existing
  ? ['--method', 'PUT', `repos/${args.repo}/rulesets/${existing.id}`]
  : ['--method', 'POST', `repos/${args.repo}/rulesets`];
const result = gh(['api', ...endpoint, '--input', '-'], body);
if (result.status !== 0)
  fail(`gh api failed: ${result.stderr.trim() || result.stdout.trim()}`);

const saved = JSON.parse(result.stdout);
console.log(
  `${existing ? 'Updated' : 'Created'} ruleset "${saved.name}" (id ${
    saved.id
  }) on ${args.repo}.`,
);
