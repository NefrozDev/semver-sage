import { githubSlug, kebabSlug } from '../chunker';
import { commitBefore, historyClone, latestPerMajor, listBranches, listReleaseTags } from '../git';
import { githubBlobBase, loadMarkdownPages } from './markdown-repo';
import { DatedSnapshot, snapshotSources } from './snapshots';
import type { SourceAdapter, VersionSource } from './types';

const DOCS_REPO = 'nestjs/docs.nestjs.com';

/**
 * Majors older than the docs repo's branches: master just before the next major shipped (npm
 * release dates of @nestjs/core 7.0.0 … 10.0.0). The docs became markdown in February 2019 (Nest 6).
 */
const MASTER_SNAPSHOTS: DatedSnapshot[] = [
  { version: '6', before: '2020-03-13' },
  { version: '7', before: '2021-07-07' },
  { version: '8', before: '2022-07-08' },
  { version: '9', before: '2023-06-15' },
];

/** Snapshot versions not already covered by a branch, cited on GitHub at their commit. */
export function nestSnapshotVersions(
  commitAt: (before: string) => Promise<string>,
  branchMajors: number[],
): Promise<VersionSource[]> {
  return snapshotSources(
    MASTER_SNAPSHOTS.filter((s) => !branchMajors.includes(Number(s.version))),
    commitAt,
    (version, ref) => ({ version, repo: DOCS_REPO, ref, paths: ['content'], docsBaseUrl: githubBlobBase(DOCS_REPO, ref) }),
  );
}

/** Top-level pages whose docs.nestjs.com route differs from the file name. */
const ROUTE_RENAMES: Record<string, string> = {
  introduction: '',
  components: 'providers',
  middlewares: 'middleware',
  migration: 'migration-guide',
  'application-context': 'standalone-applications',
};

/**
 * Pages start with "### Title" and use "####" for sections: promote the first heading to the page
 * title. Code samples carry `@@filename(x)` markers and a JavaScript copy after `@@switch`: keep the
 * file name as a comment and only the TypeScript version.
 */
export function cleanNestMarkdown(markdown: string): string {
  let titled = false;
  const out: string[] = [];
  let inFence = false;
  let skipping = false;
  for (const line of markdown.split('\n')) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      skipping = false;
      out.push(line);
      continue;
    }
    if (inFence) {
      if (/^\s*@@switch\s*$/.test(line)) skipping = true;
      else if (!skipping) out.push(line.replace(/^(\s*)@@filename\((.*)\)\s*$/, '$1// $2'));
      continue;
    }
    if (!titled && /^#{1,6}\s/.test(line)) {
      out.push(line.replace(/^#+/, '#'));
      titled = true;
      continue;
    }
    out.push(line);
  }
  return out.join('\n');
}

/**
 * NestJS docs: one branch per past major ("10.0.0", "11.0.0") and master for the current one.
 * docs.nestjs.com only serves the current docs (/v10/... redirects there), so past majors are cited
 * on GitHub at their branch. When a new major ships, re-ingest NestJS so the previous one moves to
 * its branch's GitHub links.
 */
export const nestjsAdapter: SourceAdapter = {
  framework: 'nestjs',

  async versions({ repoCacheDir }) {
    const [latest] = latestPerMajor(await listReleaseTags('nestjs/nest')).slice(-1);
    const past = (await listBranches(DOCS_REPO))
      .map((branch) => ({ branch, major: Number(/^(\d+)\.0\.0$/.exec(branch)?.[1]) }))
      .filter((b) => b.major && b.major < latest.major)
      .sort((a, b) => a.major - b.major);
    const history = await historyClone(repoCacheDir, DOCS_REPO, 'master');
    const snapshots = await nestSnapshotVersions(
      (before) => commitBefore(history, 'master', before),
      past.map((b) => b.major),
    );
    return [
      ...snapshots,
      ...past.map(
        (b): VersionSource => ({
          version: String(b.major),
          repo: DOCS_REPO,
          ref: b.branch,
          paths: ['content'],
          docsBaseUrl: githubBlobBase(DOCS_REPO, b.branch),
        }),
      ),
      {
        version: String(latest.major),
        repo: DOCS_REPO,
        ref: 'master',
        paths: ['content'],
        docsBaseUrl: 'https://docs.nestjs.com/',
      },
    ];
  },

  loadPages(checkoutDir, source) {
    const onGithub = source.docsBaseUrl.startsWith('https://github.com/');
    return loadMarkdownPages(checkoutDir, source, {
      splitDepth: 4,
      slugify: (heading) => (onGithub ? githubSlug(heading) : kebabSlug(heading)),
      preprocess: cleanNestMarkdown,
      toUrlPath: (sourcePath) => {
        if (sourcePath.startsWith('content/discover/')) return null;
        if (onGithub) return sourcePath;
        const route = sourcePath.replace(/^content\//, '').replace(/\.md$/, '');
        return ROUTE_RENAMES[route] ?? route;
      },
    });
  },
};
