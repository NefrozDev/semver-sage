import { posix } from 'node:path';
import { githubSlug } from '../chunker';
import { gitIn, historyClone } from '../git';
import { frontmatterField, githubBlobBase, loadMarkdownPages } from './markdown-repo';
import type { SourceAdapter, VersionSource } from './types';

const REPO = 'microsoft/TypeScript-Website';
const BRANCH = 'v2';
const DOCS = 'packages/documentation/copy/en';
const OPTIONS = 'packages/tsconfig-reference/copy/en/options';
const NOTES = `${DOCS}/release-notes`;
const MIN_MAJOR = 3;

/**
 * tsconfig option files have no heading: give them one, so each option becomes its own chunk
 * ("TSConfig: Strict Null Checks" › strictNullChecks).
 */
export function tsconfigOptionPage(markdown: string, sourcePath: string): string {
  const option = posix.basename(sourcePath, '.md');
  const display = frontmatterField(markdown, 'display') ?? option;
  const body = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').trimStart();
  return `# TSConfig: ${display}\n\n## ${option}\n\n${body}`;
}

/**
 * typescriptlang.org only serves the latest docs, so each major is a snapshot of the website repo
 * taken just before the next major's release notes landed (the docs as they stood for 4.9, 5.9,
 * ...); the newest major is the branch head. Every version cites GitHub at its snapshot commit:
 * version-exact links, and page paths stay identical across versions so unchanged text dedupes.
 */
export const typescriptAdapter: SourceAdapter = {
  framework: 'typescript',

  async versions({ repoCacheDir }) {
    const history = await historyClone(repoCacheDir, REPO, BRANCH);
    const notes = (await gitIn(history, ['ls-tree', '--name-only', BRANCH, `${NOTES}/`])).split('\n');
    const majors = [...new Set(notes.map((f) => Number(/TypeScript (\d+)\.\d+\.md$/.exec(f)?.[1])))]
      .filter((m) => m >= MIN_MAJOR)
      .sort((a, b) => a - b);
    const latest = majors[majors.length - 1];

    const versions: VersionSource[] = [];
    for (const major of majors) {
      let ref = await gitIn(history, ['rev-parse', BRANCH]);
      if (major !== latest) {
        const nextNotes = await gitIn(history, [
          'log', BRANCH, '--diff-filter=A', '--format=%H', '-1', '--', `${NOTES}/TypeScript ${major + 1}.0.md`,
        ]);
        if (!nextNotes) continue;
        ref = await gitIn(history, ['rev-parse', `${nextNotes}^`]);
      }
      versions.push({
        version: String(major),
        repo: REPO,
        ref,
        paths: [DOCS, OPTIONS],
        docsBaseUrl: githubBlobBase(REPO, ref),
      });
    }
    return versions;
  },

  loadPages(checkoutDir, source) {
    const hasHandbookV2 = Number(source.version) >= 4;
    return loadMarkdownPages(checkoutDir, source, {
      slugify: (heading) => githubSlug(heading),
      preprocess: (markdown, sourcePath) =>
        sourcePath.startsWith(OPTIONS) ? tsconfigOptionPage(markdown, sourcePath) : markdown,
      // From 4.x the site serves Handbook v2; v1 pages are deprecated leftovers.
      // File names have spaces ("TypeScript 5.0.md"), so the URL path is percent-encoded.
      toUrlPath: (sourcePath) =>
        hasHandbookV2 && sourcePath.includes('/handbook-v1/')
          ? null
          : sourcePath.split('/').map(encodeURIComponent).join('/'),
    });
  },
};
