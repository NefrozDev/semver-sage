import { SOURCE_PLACEHOLDER } from '@semver-sage/server-core';
import { githubSlug, kebabSlug } from '../chunker';
import { latestPerMajor, listReleaseTags, ReleaseTag } from '../git';
import { githubBlobBase, loadMarkdownPages } from './markdown-repo';
import type { SourceAdapter, VersionSource } from './types';

const REPO = 'vercel/next.js';
// The docs moved into the repo (`docs/`) during 9.x; before that, the README was the documentation.
const FIRST_DOCS_FOLDER_MAJOR = 9;
/** Same URL path for every README so unchanged sections dedupe across majors. */
const README_URL_PATH = 'readme';

/** Where each major's README lives (the file was renamed, then moved with the monorepo in 8). */
export function readmePath(major: number): string {
  if (major === 8) return 'packages/next/README.md';
  return major === 1 || major === 7 ? 'README.md' : 'readme.md';
}

/** Next.js 1–8: the README at the newest tag of each major, cited on GitHub. */
function readmeSource(tag: string, major: number): VersionSource {
  return {
    version: String(major),
    repo: REPO,
    ref: tag,
    paths: [readmePath(major)],
    docsBaseUrl: githubBlobBase(REPO, tag) + SOURCE_PLACEHOLDER,
  };
}

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

/** nextjs.org keeps versioned docs from 13 on and the newest major at /docs; older ones are on GitHub. */
function docsBaseUrl(t: ReleaseTag, latest: number): string {
  if (t.major === latest) return 'https://nextjs.org/docs/';
  if (t.major >= 13) return `https://nextjs.org/docs/${t.major}/`;
  return githubBlobBase(REPO, t.tag);
}

/** Next.js docs: the README for 1–8, then vercel/next.js `docs/` at the newest release of each major. */
export const nextjsAdapter: SourceAdapter = {
  framework: 'nextjs',

  async versions() {
    const tags = latestPerMajor(await listReleaseTags(REPO), (t) => t.major >= 1);
    const latest = Math.max(...tags.map((t) => t.major));
    return tags.map((t) =>
      t.major < FIRST_DOCS_FOLDER_MAJOR
        ? readmeSource(t.tag, t.major)
        : { version: String(t.major), repo: REPO, ref: t.tag, paths: ['docs'], docsBaseUrl: docsBaseUrl(t, latest) },
    );
  },

  loadPages(checkoutDir, source) {
    if (source.paths.some((p) => /readme\.md$/i.test(p))) {
      return loadMarkdownPages(checkoutDir, source, {
        splitDepth: 4,
        slugify: (heading) => githubSlug(heading),
        // The README has no title of its own.
        preprocess: (markdown) => `# Next.js\n\n${markdown}`,
        toUrlPath: () => README_URL_PATH,
      });
    }
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
