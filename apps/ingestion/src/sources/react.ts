import { githubSlug, kebabSlug } from '../chunker';
import { commitBefore, historyClone, latestPerMinor, listReleaseTags, ReleaseTag } from '../git';
import { frontmatterField, githubBlobBase, loadMarkdownPages } from './markdown-repo';
import { snapshotSources } from './snapshots';
import type { SourceAdapter, VersionSource } from './types';

const REPO = 'reactjs/react.dev';
const LEGACY_REPO = 'facebook/react';

/**
 * React keeps each major's docs on a branch of reactjs/react.dev: `v17.0.2` (the Gatsby-era
 * reactjs.org, class components first), `v18` and `main` (react.dev, hooks first).
 */
const VERSIONS: VersionSource[] = [
  { version: '17', repo: REPO, ref: 'v17.0.2', paths: ['content/docs'], docsBaseUrl: 'https://17.reactjs.org/' },
  {
    version: '18',
    repo: REPO,
    ref: 'v18',
    paths: ['src/content/learn', 'src/content/reference'],
    docsBaseUrl: 'https://18.react.dev/',
  },
  {
    version: '19',
    repo: REPO,
    ref: 'main',
    paths: ['src/content/learn', 'src/content/reference'],
    docsBaseUrl: 'https://react.dev/',
  },
];

/** npm publish dates of 16.1.0 … 16.14.0 and 17.0.0 (`npm view react time`): React 16.N ends at index N. */
const RELEASES_AFTER_16_MINORS = [
  '2017-11-09', '2017-11-28', '2018-03-29', '2018-05-24', '2018-09-06', '2018-10-23', '2018-12-20',
  '2019-02-06', '2019-08-08', '2019-09-27', '2019-10-22', '2019-11-14', '2020-02-26', '2020-10-14',
  '2020-10-20',
];

/**
 * React 16.0–16.14: reactjs.org (react.dev's history, same layout and URLs as 17) as it stood just
 * before the next release, so each minor gets the docs written for it. Cited on 16.reactjs.org.
 */
export function react16Versions(commitAt: (before: string) => Promise<string>): Promise<VersionSource[]> {
  return snapshotSources(
    RELEASES_AFTER_16_MINORS.map((before, minor) => ({ version: `16.${minor}`, before })),
    commitAt,
    (version, ref) => ({ version, repo: REPO, ref, paths: ['content/docs'], docsBaseUrl: 'https://16.reactjs.org/' }),
  );
}

/** Security releases cut from old branches in October 2020, after the docs had left the repo. */
const RELEASES_WITHOUT_DOCS = new Set(['0.14.10', '15.7.0']);

/**
 * React 0.3–15.6: the Jekyll docs in facebook/react `docs/` at each minor's last release, cited on
 * GitHub (no hosted site left).
 */
export function legacyReactVersions(tags: ReleaseTag[]): VersionSource[] {
  const hasDocs = (t: ReleaseTag) =>
    (t.major === 0 || t.major === 15) && !RELEASES_WITHOUT_DOCS.has(`${t.major}.${t.minor}.${t.patch}`);
  return latestPerMinor(tags, hasDocs).map((t) => ({
    version: `${t.major}.${t.minor}`,
    repo: LEGACY_REPO,
    ref: t.tag,
    paths: ['docs/docs', 'docs/tips', 'docs/tutorial'],
    docsBaseUrl: githubBlobBase(LEGACY_REPO, t.tag),
  }));
}

/** Legacy pages are cited by their file path; translations ("02-displaying-data.zh-CN.md") are skipped. */
export const legacyReactUrlPath = (sourcePath: string): string | null =>
  /\.[a-z]{2}-[A-Z]{2}\.md$/.test(sourcePath) ? null : sourcePath;

/** react.dev: "src/content/reference/react/useState.md" -> "reference/react/useState" */
export function reactDevUrlPath(sourcePath: string): string {
  return sourcePath
    .replace(/^src\/content\//, '')
    .replace(/\.md$/, '')
    .replace(/\/index$/, '');
}

export const reactAdapter: SourceAdapter = {
  framework: 'react',

  async versions({ repoCacheDir }) {
    const history = await historyClone(repoCacheDir, REPO, 'main');
    return [
      ...legacyReactVersions(await listReleaseTags(LEGACY_REPO)),
      ...(await react16Versions((before) => commitBefore(history, 'main', before))),
      ...VERSIONS,
    ];
  },

  loadPages(checkoutDir, source) {
    if (source.repo === LEGACY_REPO) {
      return loadMarkdownPages(checkoutDir, source, {
        slugify: (heading) => githubSlug(heading),
        toUrlPath: legacyReactUrlPath,
      });
    }
    return loadMarkdownPages(checkoutDir, source, {
      slugify: (heading) => kebabSlug(heading),
      toUrlPath: (sourcePath, _source, markdown) =>
        // reactjs.org pages declare their URL ("permalink: docs/react-api.html").
        sourcePath.startsWith('content/docs/') ? frontmatterField(markdown, 'permalink') : reactDevUrlPath(sourcePath),
    });
  },
};
