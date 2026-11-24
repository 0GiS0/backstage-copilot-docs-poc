#!/usr/bin/env node
// READ-ONLY. Lists the enabled member users of the Entra tenant that are NOT
// assigned (directly or through a group) to the GitHub EMU enterprise app,
// i.e. the users without a GitHub/Copilot license. Only GET requests are made.
import { fail, parseCli, run } from './lib.mjs';

const HELP = `Usage: node scripts/docs-studio/list-entra-unlicensed.mjs [options]

Read-only. Needs the Azure CLI (\`az\`) logged into the tenant with permission
to read users, groups and service principals (e.g. Directory Readers).

Finds the "GitHub Enterprise Managed User" enterprise application, expands its
user and group assignments (groups transitively) and prints the enabled member
users (guests excluded) that are NOT assigned to it.

Options:
  --sp-id <id>    Object id of the enterprise application (service principal).
                  Skips the search by display name.
  --name <text>   Display name to search for. Default: "GitHub Enterprise Managed User".
  --tenant <id>   Expected tenant id. Fails if \`az\` is logged into another tenant.
  --json          Print JSON instead of a table.
  -h, --help      Show this help.

If you are not logged in:  az login --tenant <tenant-id-or-domain> --allow-no-subscriptions`;

const args = parseCli(
  {
    'sp-id': { type: 'string' },
    name: { type: 'string' },
    tenant: { type: 'string' },
    json: { type: 'boolean' },
  },
  HELP,
);

const GRAPH = 'https://graph.microsoft.com/v1.0';

function az(azArgs) {
  const result = run('az', [...azArgs, '--output', 'json']);
  if (result.status !== 0) {
    fail(`az ${azArgs[0]} failed: ${result.stderr.trim().split('\n').pop()}`);
  }
  return JSON.parse(result.stdout || 'null');
}

/** GET with @odata.nextLink pagination. */
function graphGetAll(url) {
  const items = [];
  let next = url;
  while (next) {
    const page = az([
      'rest',
      '--method',
      'get',
      '--url',
      next,
      '--headers',
      'ConsistencyLevel=eventual',
    ]);
    items.push(...(page.value ?? []));
    next = page['@odata.nextLink'];
  }
  return items;
}

const account = run('az', ['account', 'show', '--output', 'json']);
if (account.status !== 0) {
  fail(
    'az is not logged in (or not installed). Run:\n  az login --tenant <tenant-id-or-domain> --allow-no-subscriptions',
  );
}
const { tenantId } = JSON.parse(account.stdout);
if (args.tenant && args.tenant.toLowerCase() !== tenantId.toLowerCase()) {
  fail(
    `az is logged into tenant ${tenantId}, expected ${args.tenant}.\n  az login --tenant ${args.tenant} --allow-no-subscriptions`,
  );
}
console.error(`Tenant: ${tenantId}`);

let spId = args['sp-id'];
if (!spId) {
  const search = encodeURIComponent(
    `"displayName:${args.name ?? 'GitHub Enterprise Managed User'}"`,
  );
  const matches = graphGetAll(
    `${GRAPH}/servicePrincipals?$search=${search}&$select=id,displayName,appId&$count=true`,
  );
  if (matches.length === 0) {
    fail('No matching enterprise application found. Use --sp-id or --name.');
  }
  if (matches.length > 1) {
    console.error('Several applications match; pass one with --sp-id:');
    matches.forEach(m => console.error(`  ${m.id}  ${m.displayName}`));
    process.exit(1);
  }
  spId = matches[0].id;
  console.error(`Enterprise app: ${matches[0].displayName} (${spId})`);
}

const assignments = graphGetAll(
  `${GRAPH}/servicePrincipals/${spId}/appRoleAssignedTo?$top=999`,
);
const assigned = new Set();
let groupCount = 0;
for (const assignment of assignments) {
  if (assignment.principalType === 'User') {
    assigned.add(assignment.principalId);
  } else if (assignment.principalType === 'Group') {
    groupCount++;
    graphGetAll(
      `${GRAPH}/groups/${assignment.principalId}/transitiveMembers/microsoft.graph.user?$select=id&$top=999&$count=true`,
    ).forEach(member => assigned.add(member.id));
  }
}
console.error(
  `Assignments: ${assignments.length} (${groupCount} groups) -> ${assigned.size} assigned users`,
);

const filter = encodeURIComponent(
  "userType eq 'Member' and accountEnabled eq true",
);
const users = graphGetAll(
  `${GRAPH}/users?$filter=${filter}&$select=id,displayName,userPrincipalName,mail&$top=999&$count=true`,
);
const unlicensed = users
  .filter(user => !assigned.has(user.id))
  .map(({ id, displayName, userPrincipalName, mail }) => ({
    id,
    displayName,
    userPrincipalName,
    mail: mail ?? null,
  }))
  .sort((a, b) => (a.displayName ?? '').localeCompare(b.displayName ?? ''));

if (args.json) {
  console.log(JSON.stringify(unlicensed, null, 2));
} else if (unlicensed.length === 0) {
  console.log('Every enabled member user is assigned to the GitHub app.');
} else {
  console.table(unlicensed);
  console.log(
    `${unlicensed.length} of ${users.length} enabled member users are not assigned.`,
  );
  console.log(
    'Use "id" as graph.microsoft.com/user-id and mail (or userPrincipalName when mail is empty) as spec.profile.email.',
  );
}
