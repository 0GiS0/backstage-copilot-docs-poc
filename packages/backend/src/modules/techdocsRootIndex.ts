import fs from 'node:fs/promises';
import path from 'node:path';
import {
  coreServices,
  createBackendModule,
} from '@backstage/backend-plugin-api';
import {
  GeneratorBase,
  GeneratorRunOptions,
  TechdocsGenerator,
  getMkDocsYml,
  techdocsGeneratorExtensionPoint,
} from '@backstage/plugin-techdocs-node';
import { parse } from 'yaml';

type NavItem = string | { [title: string]: NavItem | NavItem[] };

const INDEX_CANDIDATES = ['index.md', 'README.md', 'readme.md'];

/** Returns the first page path found in an MkDocs nav tree. */
function firstPage(item: NavItem | NavItem[] | undefined): string | undefined {
  if (!item) return undefined;
  if (typeof item === 'string') return item;
  const children = Array.isArray(item) ? item : Object.values(item);
  for (const child of children) {
    const found = firstPage(child);
    if (found) return found;
  }
  return undefined;
}

function isExternal(page: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(page);
}

/**
 * Builds a landing `index.md` that links to the top-level nav entries.
 * TechDocs requires a root `index.html`; MkDocs only emits one when the
 * docs directory has a root `index.md` or `README.md`.
 */
export function buildLandingPage(
  siteName: string,
  nav: NavItem[] | undefined,
): string | undefined {
  const links = (nav ?? [])
    .map(item => {
      const page = firstPage(item);
      if (!page || isExternal(page)) return undefined;
      const title =
        typeof item === 'string'
          ? path.posix.basename(page, '.md')
          : Object.keys(item)[0];
      return `- [${title}](${encodeURI(page)})`;
    })
    .filter((line): line is string => Boolean(line));

  if (links.length === 0) return undefined;

  return [
    `# ${siteName}`,
    '',
    'This landing page is generated at build time because the documentation',
    'repository has no root `index.md`. Start with one of these sections:',
    '',
    ...links,
    '',
  ].join('\n');
}

/**
 * Wraps the default MkDocs generator and adds a landing page to the
 * temporary build input when the docs directory has no root index.
 * The source repository is never modified.
 */
export class RootIndexGenerator implements GeneratorBase {
  constructor(private readonly inner: GeneratorBase) {}

  async run(opts: GeneratorRunOptions): Promise<void> {
    try {
      await this.ensureRootIndex(opts);
    } catch (error) {
      opts.logger.warn(`Could not add a TechDocs landing page: ${error}`);
    }
    await this.inner.run(opts);
  }

  private async ensureRootIndex(opts: GeneratorRunOptions): Promise<void> {
    const { content } = await getMkDocsYml(opts.inputDir, {
      name: opts.siteOptions?.name,
    });
    const mkdocs = (parse(content) ?? {}) as {
      site_name?: string;
      docs_dir?: string;
      nav?: NavItem[];
    };
    const inputDir = path.resolve(opts.inputDir);
    const docsDir = path.resolve(inputDir, mkdocs.docs_dir ?? 'docs');
    if (docsDir !== inputDir && !docsDir.startsWith(`${inputDir}${path.sep}`)) {
      return;
    }

    for (const candidate of INDEX_CANDIDATES) {
      const exists = await fs
        .access(path.join(docsDir, candidate))
        .then(() => true)
        .catch(() => false);
      if (exists) return;
    }

    const landing = buildLandingPage(
      mkdocs.site_name ?? 'Documentation',
      mkdocs.nav,
    );
    if (!landing) return;

    await fs.writeFile(path.join(docsDir, 'index.md'), landing, 'utf8');
    opts.logger.info(
      'Added a generated landing index.md to the TechDocs build input',
    );
  }
}

/** Replaces the default TechDocs generator with {@link RootIndexGenerator}. */
export default createBackendModule({
  pluginId: 'techdocs',
  moduleId: 'root-index',
  register(env) {
    env.registerInit({
      deps: {
        config: coreServices.rootConfig,
        logger: coreServices.logger,
        generators: techdocsGeneratorExtensionPoint,
      },
      async init({ config, logger, generators }) {
        const inner = TechdocsGenerator.fromConfig(config, { logger });
        generators.setTechdocsGenerator(new RootIndexGenerator(inner));
      },
    });
  },
});
