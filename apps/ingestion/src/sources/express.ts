import { posix } from 'node:path';
import { githubSlug } from '../chunker';
import { githubBlobBase, loadMarkdownPages } from './markdown-repo';
import type { SourceAdapter, VersionSource } from './types';

const REPO = 'expressjs/expressjs.com';
/** Express 1 and 2 shipped their docs in the framework repo (`docs/*.md`), at their last tag. */
const LEGACY_REPO = 'expressjs/express';
const LEGACY_TAGS: Record<string, string> = { '1': '1.0.8', '2': '2.5.11' };
/** Legacy doc pages and their titles (the files have none); contributing and screencasts are skipped. */
const LEGACY_PAGES = new Map([
  ['index', 'Express'],
  ['guide', 'Guide'],
  ['migrate', 'Migration'],
  ['executable', 'Executable'],
  ['applications', 'Applications'],
]);

const LEGACY: VersionSource[] = Object.entries(LEGACY_TAGS).map(([major, tag]) => ({
  version: major,
  repo: LEGACY_REPO,
  ref: tag,
  paths: ['docs'],
  docsBaseUrl: githubBlobBase(LEGACY_REPO, tag),
}));

/**
 * expressjs.com keeps every major from 3 side by side on main: API references in
 * src/content/api/<v>x (3.x, 4.x, 5.x) and guides in src/content/docs/en/<v>x (4.x, 5.x). English only.
 */
const VERSIONS: VersionSource[] = [
  ...LEGACY,
  ...['3', '4', '5'].map((major) => ({
    version: major,
    repo: REPO,
    ref: 'main',
    paths: [`src/content/api/${major}x`, ...(major === '3' ? [] : [`src/content/docs/en/${major}x`])],
    docsBaseUrl: 'https://expressjs.com/',
  })),
];

const legacyPage = (sourcePath: string) => posix.basename(sourcePath, '.md');

/** Astro MDX: drop component imports (outside code). */
export function cleanExpressMdx(markdown: string): string {
  let inFence = false;
  return markdown
    .split('\n')
    .filter((line) => {
      if (/^\s*```/.test(line)) inFence = !inFence;
      return inFence || !/^import\s.+\sfrom\s+['"].+['"];?\s*$/.test(line);
    })
    .join('\n');
}

/**
 * "src/content/api/5x/api/request/index.mdx" -> "en/5x/api/request/",
 * "src/content/api/5x/api.mdx" -> "en/5x/api/", "src/content/docs/en/4x/guide/routing.mdx" -> "en/4x/guide/routing/"
 */
export function expressUrlPath(sourcePath: string): string | null {
  const match = /^src\/content\/(?:api|docs\/en)\/(\dx)\/(.+?)(?:\/index)?\.mdx?$/.exec(sourcePath);
  return match ? `en/${match[1]}/${match[2]}/` : null;
}

export const expressAdapter: SourceAdapter = {
  framework: 'express',

  async versions() {
    return VERSIONS;
  },

  loadPages(checkoutDir, source) {
    if (source.repo === LEGACY_REPO) {
      return loadMarkdownPages(checkoutDir, source, {
        slugify: (heading) => githubSlug(heading),
        preprocess: (markdown, sourcePath) => `# ${LEGACY_PAGES.get(legacyPage(sourcePath))}\n\n${markdown}`,
        // Cited on GitHub at the tag: "docs/guide.md"
        toUrlPath: (sourcePath) => (LEGACY_PAGES.has(legacyPage(sourcePath)) ? sourcePath : null),
      });
    }
    return loadMarkdownPages(checkoutDir, source, {
      extensions: ['.md', '.mdx'],
      slugify: (heading) => githubSlug(heading),
      preprocess: cleanExpressMdx,
      toUrlPath: expressUrlPath,
    });
  },
};
