#!/usr/bin/env node
// Builds the "docs-studio-playground" repository tree from the Confluence PoC
// corpus: two TechDocs sites (engineering, restricted security) plus a root
// catalog Location. Local by default; --push needs --apply.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';
import { fail, parseCli, run } from './lib.mjs';

const HELP = `Usage: node scripts/docs-studio/seed-playground.mjs --out <dir> [options]

Builds the playground repository tree from the Confluence PoC corpus.

Options:
  --corpus <dir>      Local checkout of the corpus. Default: shallow clone of
                      https://github.com/0GiS0/confluence-to-github-poc (main)
                      into a temp dir.
  --out <dir>         Output directory (required). Must be empty or missing.
  --force             Delete --out first if it already exists.
  --push <owner/repo> After building, git init + commit + push to that
                      (already existing, preferably empty) GitHub repo.
  --apply             Actually push. Without it --push only prints the commands.
  -h, --help          Show this help.

Output:
  engineering/   TechDocs site "Engineering Handbook" (without Security & Compliance)
  security/      TechDocs site "Security Handbook" (annotated as restricted)
  catalog-info.yaml  Location -> engineering/ and security/ catalog-info.yaml
  README.md, .gitignore

Cross-section links: engineering -> security links become plain text marked
"(restricted)"; security -> engineering links become absolute TechDocs paths
(/docs/default/component/engineering-handbook/...). Everything else is rewritten
so relative links stay valid after the move. A link report is printed and the
exit code is 1 if any relative link is broken.

Nothing here touches GitHub unless --push is combined with --apply.`;

const args = parseCli(
  {
    corpus: { type: 'string' },
    out: { type: 'string' },
    force: { type: 'boolean' },
    push: { type: 'string' },
    apply: { type: 'boolean' },
  },
  HELP,
);

const CORPUS_REPO = 'https://github.com/0GiS0/confluence-to-github-poc';
const HANDBOOK_ROOT = 'Confluence Migration PoC/Engineering Handbook';
const SECURITY_DIR = 'Security & Compliance';
const ATTACHMENTS = 'attachments';
const ENGINEERING_TECHDOCS = '/docs/default/component/engineering-handbook';
const LINK_RE = /(!?)\[([^\]]*)\]\(([^)\s]*)\)/g;

if (!args.out) fail('--out <dir> is required (see --help).');
const outDir = path.resolve(args.out);

// ---------------------------------------------------------------- corpus
let corpusDir = args.corpus ? path.resolve(args.corpus) : undefined;
if (!corpusDir) {
  corpusDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-studio-corpus-'));
  console.log(`Cloning ${CORPUS_REPO} into ${corpusDir} ...`);
  const clone = run('git', [
    'clone',
    '--depth',
    '1',
    '--branch',
    'main',
    CORPUS_REPO,
    corpusDir,
  ]);
  if (clone.status !== 0) fail(`git clone failed: ${clone.stderr.trim()}`);
}
const corpusConfig = YAML.parse(
  fs.readFileSync(path.join(corpusDir, 'mkdocs.yml'), 'utf8'),
);
const docsDir = path.join(corpusDir, corpusConfig.docs_dir ?? 'docs');
if (!fs.existsSync(path.join(docsDir, HANDBOOK_ROOT))) {
  fail(`"${HANDBOOK_ROOT}" not found under ${docsDir}`);
}

if (fs.existsSync(outDir) && fs.readdirSync(outDir).length > 0) {
  if (!args.force) fail(`${outDir} is not empty. Use --force to replace it.`);
  fs.rmSync(outDir, { recursive: true, force: true });
}
fs.mkdirSync(outDir, { recursive: true });

// ----------------------------------------------------------- page mapping
function listMarkdown(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listMarkdown(full, base);
    return entry.name.endsWith('.md')
      ? [path.relative(base, full).split(path.sep).join('/')]
      : [];
  });
}

/** Maps a corpus path (relative to docs_dir) to { section, rel } or undefined. */
function mapPage(oldRel) {
  if (!oldRel.startsWith(`${HANDBOOK_ROOT}/`)) return undefined;
  const inside = oldRel.slice(HANDBOOK_ROOT.length + 1);
  const isSecurity = inside.startsWith(`${SECURITY_DIR}/`);
  const rel = isSecurity ? inside.slice(SECURITY_DIR.length + 1) : inside;
  return {
    section: isSecurity ? 'security' : 'engineering',
    rel: rel === 'README.md' ? 'index.md' : rel,
  };
}

const pages = new Map(); // old rel -> { section, rel }
for (const oldRel of listMarkdown(docsDir)) {
  const mapped = mapPage(oldRel);
  if (mapped) pages.set(oldRel, mapped);
}

// ----------------------------------------------------------- link rewrite
const stats = {
  rewritten: 0,
  kept: 0,
  restrictedToText: 0,
  toTechDocs: 0,
  attachments: new Map(), // section -> Set of file names
};

const encodePath = p => p.replace(/ /g, '%20');

function techDocsUrl(rel) {
  const noExt = rel.replace(/\.md$/, '');
  const url = noExt
    .replace(/(^|\/)(index|README)$/, '')
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/');
  return `${ENGINEERING_TECHDOCS}/${url}${url ? '/' : ''}`;
}

function rewriteContent(content, oldRel, from) {
  const oldDir = path.posix.dirname(oldRel);
  const fromDir = path.posix.dirname(from.rel);
  return content.replace(LINK_RE, (whole, bang, text, rawTarget) => {
    if (
      !rawTarget ||
      rawTarget.startsWith('#') ||
      rawTarget.startsWith('/') ||
      /^[a-z][a-z0-9+.-]*:/i.test(rawTarget)
    ) {
      return whole;
    }
    const hashAt = rawTarget.search(/[#?]/);
    const rawPath = hashAt === -1 ? rawTarget : rawTarget.slice(0, hashAt);
    const suffix = hashAt === -1 ? '' : rawTarget.slice(hashAt);
    let decoded;
    try {
      decoded = decodeURIComponent(rawPath);
    } catch {
      return whole;
    }
    const resolved = path.posix.normalize(path.posix.join(oldDir, decoded));

    let target; // { section, rel }
    const attachmentPrefix = `${ATTACHMENTS}/`;
    if (resolved.startsWith(attachmentPrefix)) {
      if (!fs.existsSync(path.join(docsDir, resolved))) return whole;
      target = { section: from.section, rel: resolved };
      if (!stats.attachments.has(from.section)) {
        stats.attachments.set(from.section, new Set());
      }
      stats.attachments.get(from.section).add(resolved);
    } else {
      target = pages.get(resolved);
      if (!target) return whole;
    }

    if (target.section !== from.section) {
      if (bang) return whole;
      if (from.section === 'engineering') {
        stats.restrictedToText++;
        return `${text} *(restricted)*`;
      }
      stats.toTechDocs++;
      return `[${text}](${techDocsUrl(target.rel)}${suffix})`;
    }

    const newRel = path.posix.relative(fromDir, target.rel);
    stats.rewritten++;
    if (newRel === decoded) {
      stats.kept++;
      return whole;
    }
    return `${bang}[${text}](${encodePath(newRel)}${suffix})`;
  });
}

// ------------------------------------------------------------------ nav
function findSectionNav(items, key) {
  const found = items.find(item => typeof item === 'object' && key in item);
  return found?.[key];
}

function mapNav(item, section) {
  if (typeof item === 'string') {
    const mapped = pages.get(item);
    if (!mapped || mapped.section !== section) {
      fail(`nav entry "${item}" has no page in section ${section}`);
    }
    return mapped.rel === 'index.md' ? { Home: 'index.md' } : mapped.rel;
  }
  const [[title, value]] = Object.entries(item);
  return {
    [title]: Array.isArray(value)
      ? value.map(child => mapNav(child, section))
      : pages.get(value)?.rel ?? fail(`nav entry "${value}" not found`),
  };
}

const corpusNav = corpusConfig.nav ?? [];
const securityNav = findSectionNav(corpusNav, SECURITY_DIR);
if (!securityNav) fail(`"${SECURITY_DIR}" section not found in corpus nav.`);
const navBySection = {
  engineering: corpusNav
    .filter(item => !(typeof item === 'object' && SECURITY_DIR in item))
    .map(item => mapNav(item, 'engineering')),
  security: securityNav.map(item => mapNav(item, 'security')),
};

// ------------------------------------------------------------ write files
const write = (rel, content) => {
  const file = path.join(outDir, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
};
const stringify = value => YAML.stringify(value, { lineWidth: 0 });

for (const [oldRel, target] of pages) {
  const original = fs.readFileSync(path.join(docsDir, oldRel), 'utf8');
  write(
    `${target.section}/docs/${target.rel}`,
    rewriteContent(original, oldRel, target),
  );
}
for (const [section, files] of stats.attachments) {
  for (const rel of files) {
    const dest = path.join(outDir, section, 'docs', rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(docsDir, rel), dest);
  }
}

const sections = {
  engineering: {
    siteName: 'Engineering Handbook',
    description:
      'Engineering handbook: platform operations, development practices and onboarding.',
    name: 'engineering-handbook',
    owner: 'group:handbook-approvers',
    annotations: {
      'backstage.io/techdocs-ref': 'dir:.',
      'docs-studio/approvers': 'group:default/handbook-approvers',
    },
    tags: ['handbook', 'engineering'],
  },
  security: {
    siteName: 'Security Handbook',
    description:
      'Security and compliance controls. Restricted to the security team.',
    name: 'security-handbook',
    owner: 'group:security-team',
    annotations: {
      'backstage.io/techdocs-ref': 'dir:.',
      'docs-studio/visibility': 'restricted',
    },
    tags: ['handbook', 'security'],
  },
};

for (const [section, cfg] of Object.entries(sections)) {
  write(
    `${section}/mkdocs.yml`,
    stringify({
      site_name: cfg.siteName,
      site_description: cfg.description,
      docs_dir: 'docs',
      nav: navBySection[section],
      plugins: corpusConfig.plugins ?? ['search'],
      markdown_extensions: corpusConfig.markdown_extensions ?? [],
    }),
  );
  write(
    `${section}/catalog-info.yaml`,
    stringify({
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: {
        name: cfg.name,
        title: cfg.siteName,
        description: cfg.description,
        annotations: cfg.annotations,
        tags: cfg.tags,
      },
      spec: {
        type: 'documentation',
        lifecycle: 'production',
        owner: cfg.owner,
      },
    }),
  );
}

write(
  'catalog-info.yaml',
  stringify({
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Location',
    metadata: {
      name: 'docs-studio-playground',
      description:
        'Docs Studio playground: engineering and security handbooks.',
    },
    spec: {
      targets: [
        './engineering/catalog-info.yaml',
        './security/catalog-info.yaml',
      ],
    },
  }),
);
write('.gitignore', 'site/\n');
write(
  'README.md',
  `# Docs Studio playground

Sample documentation repository used to try out Docs Studio, a Backstage plugin
that lets people propose documentation changes as pull requests with an
approval workflow.

It is seeded from the Confluence-to-Markdown proof of concept corpus
(${CORPUS_REPO}) and split into two TechDocs sites:

| Folder | Catalog entity | Owner | Visibility |
| --- | --- | --- | --- |
| \`engineering/\` | \`component:default/engineering-handbook\` | \`group:handbook-approvers\` | Everyone |
| \`security/\` | \`component:default/security-handbook\` | \`group:security-team\` | Restricted (\`docs-studio/visibility: restricted\`) |

The root \`catalog-info.yaml\` is a \`Location\` that registers both entities.
All content is fictional.

Docs Studio opens a pull request for every proposal and reports its approval
state through the \`docs-studio/approval\` commit status, which the branch
ruleset on \`main\` requires.
`,
);

// ------------------------------------------------------------ validation
function validate(root) {
  const report = { files: 0, links: 0, broken: [] };
  const walk = dir =>
    fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
      const full = path.join(dir, entry.name);
      if (entry.name === '.git') return;
      if (entry.isDirectory()) return walk(full);
      if (!entry.name.endsWith('.md')) return;
      report.files++;
      const text = fs.readFileSync(full, 'utf8');
      for (const [, , , rawTarget] of text.matchAll(LINK_RE)) {
        if (
          !rawTarget ||
          rawTarget.startsWith('#') ||
          rawTarget.startsWith('/') ||
          /^[a-z][a-z0-9+.-]*:/i.test(rawTarget)
        ) {
          continue;
        }
        report.links++;
        const clean = decodeURIComponent(rawTarget.split(/[#?]/)[0]);
        if (!fs.existsSync(path.resolve(path.dirname(full), clean))) {
          report.broken.push(`${path.relative(root, full)} -> ${rawTarget}`);
        }
      }
    });
  walk(root);
  for (const section of Object.keys(sections)) {
    const mkdocs = YAML.parse(
      fs.readFileSync(path.join(root, section, 'mkdocs.yml'), 'utf8'),
    );
    const visit = node => {
      if (typeof node === 'string') {
        report.links++;
        if (!fs.existsSync(path.join(root, section, 'docs', node))) {
          report.broken.push(`${section}/mkdocs.yml nav -> ${node}`);
        }
      } else if (Array.isArray(node)) node.forEach(visit);
      else Object.values(node).forEach(visit);
    };
    visit(mkdocs.nav);
  }
  return report;
}

const report = validate(outDir);
const tree = dir =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory()
      ? tree(full)
      : [path.relative(outDir, full).split(path.sep).join('/')];
  });
const files = tree(outDir).sort();
console.log(`\nPlayground tree written to ${outDir} (${files.length} files):`);
files.forEach(f => console.log(`  ${f}`));
console.log('\nLink report');
console.log(`  markdown files checked : ${report.files}`);
console.log(`  relative links + nav   : ${report.links}`);
console.log(
  `  rewritten (same site)  : ${stats.rewritten - stats.kept} (${
    stats.kept
  } unchanged)`,
);
console.log(
  `  engineering -> security: ${stats.restrictedToText} converted to plain text "(restricted)"`,
);
console.log(
  `  security -> engineering: ${stats.toTechDocs} converted to absolute TechDocs links`,
);
console.log(`  broken                 : ${report.broken.length}`);
report.broken.forEach(b => console.log(`    ! ${b}`));

// ------------------------------------------------------------------ push
if (args.push) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(args.push)) fail('--push expects owner/repo.');
  const remote = `https://github.com/${args.push}.git`;
  // An empty helper resets any global ones (e.g. osxkeychain) so the push uses
  // the gh account (or GH_TOKEN) instead of cached credentials.
  const credential = [
    '-c',
    'credential.helper=',
    '-c',
    'credential.helper=!gh auth git-credential',
  ];
  const steps = [
    ['git', ['init', '-b', 'main']],
    ['git', ['add', '-A']],
    [
      'git',
      [
        'commit',
        '-m',
        'chore: seed docs playground from Confluence PoC corpus',
      ],
    ],
    ['git', ['remote', 'add', 'origin', remote]],
    ['git', [...credential, 'push', '-u', 'origin', 'main']],
  ];
  if (!args.apply) {
    console.log(`\n[dry-run] Would run in ${outDir}:`);
    steps.forEach(([cmd, a]) => console.log(`  ${cmd} ${a.join(' ')}`));
    console.log('Re-run with --apply to push (the repo must already exist).');
  } else {
    const exists = run('gh', ['repo', 'view', args.push, '--json', 'name']);
    if (exists.status !== 0) {
      fail(
        `Repo ${args.push} is not reachable with gh: ${exists.stderr.trim()}`,
      );
    }
    for (const [cmd, a] of steps) {
      const result = run(cmd, a, { cwd: outDir });
      if (result.status !== 0)
        fail(`${cmd} ${a[0]} failed: ${result.stderr.trim()}`);
    }
    console.log(`\nPushed to ${remote}`);
  }
}

if (report.broken.length > 0) process.exit(1);
