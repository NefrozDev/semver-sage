import { kebabSlug } from '../chunker';
import { latestPerMajor, listReleaseTags } from '../git';
import { githubBlobBase, loadMarkdownPages } from './markdown-repo';
import type { SourceAdapter } from './types';

const REPO = 'vercel/next.js';
// The docs moved into the repo (`docs/`) during 9.x.
const MIN_MAJOR = 9;

/** "docs/02-app/01-building-your-application/01-routing/index.mdx" -> "app/building-your-application/routing" */
export function nextUrlPath(sourcePath: string): string {
  return sourcePath
    .replace(/^docs\//, '')
    .replace(/\.mdx?$/, '')
    .split('/')
    .map((segment) => segment.replace(/^\d+-/, ''))
    .join('/')
    .replace(/(^|\/)index$/, '');
}

/**
 * Pages-router files with `source:` are generated copies of app-router pages: skip them.
 * App-router pages hide <PagesOnly> blocks (and vice versa), and code "switchers" repeat every
 * TypeScript example in JavaScript: keep only the TypeScript one.
 */
export function cleanNextMdx(markdown: string, sourcePath: string): string | null {
  if (/^---\n[\s\S]*?^source:/m.test(markdown.split(/\n---\n/)[0] + '\n')) return null;
  const isPagesRouter = /(^|\/)\d*-?pages\//.test(sourcePath.replace(/^docs\//, ''));
  const hidden = isPagesRouter ? 'AppOnly' : 'PagesOnly';
  return markdown
    .replace(new RegExp(`<${hidden}>[\\s\\S]*?</${hidden}>`, 'g'), '')
    .replace(/^```(?:jsx?|js)\b[^\n]*\bswitcher\b[^\n]*\n[\s\S]*?^```\s*$/gm, '');
}

/** Next.js docs from vercel/next.js `docs/`, newest release of each major since 9. */
export const nextjsAdapter: SourceAdapter = {
  framework: 'nextjs',

  async versions() {
    const tags = latestPerMajor(await listReleaseTags(REPO), (t) => t.major >= MIN_MAJOR);
    const latest = Math.max(...tags.map((t) => t.major));
    return tags.map((t) => ({
      version: String(t.major),
      repo: REPO,
      ref: t.tag,
      paths: ['docs'],
      // nextjs.org keeps versioned docs from 13 on; the newest major lives at /docs.
      docsBaseUrl:
        t.major === latest
          ? 'https://nextjs.org/docs/'
          : t.major >= 13
            ? `https://nextjs.org/docs/${t.major}/`
            : githubBlobBase(REPO, t.tag),
    }));
  },

  loadPages(checkoutDir, source) {
    const onGithub = source.docsBaseUrl.startsWith('https://github.com/');
    return loadMarkdownPages(checkoutDir, source, {
      extensions: ['.md', '.mdx'],
      slugify: (heading) => kebabSlug(heading),
      preprocess: cleanNextMdx,
      toUrlPath: (sourcePath) => {
        if (/(^|\/)(\d+-)?community\//.test(sourcePath)) return null;
        return onGithub ? sourcePath : nextUrlPath(sourcePath);
      },
    });
  },
};
