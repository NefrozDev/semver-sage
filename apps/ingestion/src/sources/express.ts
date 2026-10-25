import { githubSlug } from '../chunker';
import { loadMarkdownPages } from './markdown-repo';
import type { SourceAdapter, VersionSource } from './types';

const REPO = 'expressjs/expressjs.com';

/**
 * expressjs.com keeps every major side by side on main: API references in src/content/api/<v>x
 * (3.x, 4.x, 5.x) and guides in src/content/docs/en/<v>x (4.x, 5.x). English only.
 */
const VERSIONS: VersionSource[] = ['3', '4', '5'].map((major) => ({
  version: major,
  repo: REPO,
  ref: 'main',
  paths: [`src/content/api/${major}x`, ...(major === '3' ? [] : [`src/content/docs/en/${major}x`])],
  docsBaseUrl: 'https://expressjs.com/',
}));

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
    return loadMarkdownPages(checkoutDir, source, {
      extensions: ['.md', '.mdx'],
      slugify: (heading) => githubSlug(heading),
      preprocess: cleanExpressMdx,
      toUrlPath: expressUrlPath,
    });
  },
};
