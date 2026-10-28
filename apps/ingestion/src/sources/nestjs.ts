import { SOURCE_PLACEHOLDER } from '@semver-sage/server-core';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { githubSlug, kebabSlug } from '../chunker';
import { commitBefore, historyClone, latestPerMajor, listBranches, listReleaseTags } from '../git';
import { githubBlobBase, loadMarkdownPages } from './markdown-repo';
import { DatedSnapshot, snapshotSources } from './snapshots';
import type { SourceAdapter, VersionSource } from './types';

const DOCS_REPO = 'nestjs/docs.nestjs.com';
/** Until February 2019 the docs were Angular templates: one component per page. */
const HTML_PAGES = 'src/app/homepage/pages';

/**
 * Majors older than the docs repo's branches: master just before the next major shipped (npm
 * release dates of @nestjs/core 5.0.0 … 10.0.0). The repo starts with Nest 4 (August 2017).
 */
const MASTER_SNAPSHOTS: DatedSnapshot[] = [
  { version: '4', before: '2018-05-13' },
  { version: '5', before: '2019-03-16' },
  { version: '6', before: '2020-03-13' },
  { version: '7', before: '2021-07-07' },
  { version: '8', before: '2022-07-08' },
  { version: '9', before: '2023-06-15' },
];

/**
 * Past majors are cited on GitHub but keep the docs.nestjs.com route as their URL path, so their
 * chunks dedupe with the current major's: the citation links the source file instead.
 */
const githubSource = (ref: string) => githubBlobBase(DOCS_REPO, ref) + SOURCE_PLACEHOLDER;

/** Snapshot versions not already covered by a branch, cited on GitHub at their commit. */
export function nestSnapshotVersions(
  commitAt: (before: string) => Promise<string>,
  branchMajors: number[],
): Promise<VersionSource[]> {
  return snapshotSources(
    MASTER_SNAPSHOTS.filter((s) => !branchMajors.includes(Number(s.version))),
    commitAt,
    (version, ref) => ({
      version,
      repo: DOCS_REPO,
      ref,
      paths: [Number(version) < 5 ? HTML_PAGES : 'content'],
      docsBaseUrl: githubSource(ref),
    }),
  );
}

/** Code samples of a page component: `get catsController() { return \`...\`; }`. */
export function componentSnippets(componentTs: string): Map<string, string> {
  const snippets = new Map<string, string>();
  for (const [, name, body] of componentTs.matchAll(/get\s+(\w+)\(\)\s*\{\s*return\s*`([\s\S]*?)`;\s*\}/g)) {
    snippets.set(name, body.replace(/\\([`${}\\])/g, '$1').replace(/^\n/, ''));
  }
  return snippets;
}

/** Private-use character marking where a code block goes back. */
const BLOCK_MARK = '';

const ENTITIES: Record<string, string> ={ lt: '<', gt: '>', amp: '&', quot: '"', apos: "'", nbsp: ' ' };
const decodeEntities = (text: string) =>
  text.replace(/&(#\d+|[a-z]+);/g, (entity, code: string) =>
    code.startsWith('#') ? String.fromCodePoint(Number(code.slice(1))) : (ENTITIES[code] ?? entity),
  );

/**
 * Turns a pre-2019 page template into markdown in the layout of the later docs ("###" title, "####"
 * sections). `{{ name }}` code blocks come from the component's getters; the JavaScript copy of each
 * sample (shown by the TS/JS switch) is dropped.
 */
export function nestHtmlToMarkdown(html: string, snippets: Map<string, string>): string {
  // Code blocks are set aside so the tag stripping below leaves them alone.
  const blocks: string[] = [];
  const keep = (markdown: string) => `\n\n${BLOCK_MARK}${blocks.push(markdown) - 1}${BLOCK_MARK}\n\n`;
  const text = html
    .replace(/<pre([^>]*)>\s*<code([^>]*)>([\s\S]*?)<\/code>\s*<\/pre>/g, (_, preAttrs: string, codeAttrs: string, body: string) => {
      if (/!\s*\w+\.isJsActive/.test(preAttrs)) return '';
      const language = /language-(\w+)/.exec(codeAttrs)?.[1] ?? '';
      const code = body.replace(/\{\{\s*(\w+)\s*\}\}/g, (ref, name: string) => snippets.get(name) ?? ref);
      return keep(`\`\`\`${language}\n${decodeEntities(code).trim()}\n\`\`\``);
    })
    .replace(/\{\{\s*'([^']+)'\s*\|\s*extension[^}]*\}\}/g, '$1.ts')
    .replace(/<(h[3-5])[^>]*>([\s\S]*?)<\/\1>/g, (_, tag: string, title: string) => `\n\n${'#'.repeat(Number(tag[1]))} ${title.trim()}\n\n`)
    .replace(/<code[^>]*>([\s\S]*?)<\/code>/g, '`$1`')
    .replace(/<\/?(?:strong|b)>/g, '**')
    .replace(/<\/?(?:em|i)>/g, '*')
    .replace(/<li\b[^>]*>/g, '\n- ')
    .replace(/<\/t[dh]>\s*<t[dh]\b[^>]*>/g, ' | ')
    .replace(/<\/?(?:p|blockquote|ul|ol|table|tr|div|figure|li)\b[^>]*>/g, '\n')
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<[^>]*>/g, '');
  return decodeEntities(text)
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(new RegExp(String.raw`${BLOCK_MARK}(\d+)${BLOCK_MARK}`, 'g'), (_, i: string) => blocks[Number(i)])
    .trim();
}

/** "microservices/basics/basics.component.html" under HTML_PAGES -> "microservices/basics". */
function htmlPageRoute(sourcePath: string): string {
  const route = sourcePath
    .slice(HTML_PAGES.length + 1)
    .replace(/\/[^/]+\.component\.html$/, '');
  return ROUTE_RENAMES[route] ?? route;
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
 * NestJS docs: master snapshots for 4–9, one branch per past major ("10.0.0", "11.0.0") and master
 * for the current one. docs.nestjs.com only serves the current docs (/v10/... redirects there), so
 * past majors are cited on GitHub. When a new major ships, re-ingest NestJS so the previous one
 * moves to its branch's GitHub links.
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
          docsBaseUrl: githubSource(b.branch),
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
    const slugify = (heading: string) => (onGithub ? githubSlug(heading) : kebabSlug(heading));
    if (source.paths.includes(HTML_PAGES)) {
      return loadMarkdownPages(checkoutDir, source, {
        splitDepth: 4,
        slugify,
        extensions: ['.component.html'],
        preprocess: (html, sourcePath) => {
          const componentTs = readFileSync(join(checkoutDir, sourcePath.replace(/\.html$/, '.ts')), 'utf8');
          return cleanNestMarkdown(nestHtmlToMarkdown(html, componentSnippets(componentTs)));
        },
        toUrlPath: htmlPageRoute,
      });
    }
    return loadMarkdownPages(checkoutDir, source, {
      splitDepth: 4,
      slugify,
      preprocess: cleanNestMarkdown,
      toUrlPath: (sourcePath) => {
        if (sourcePath.startsWith('content/discover/')) return null;
        const route = sourcePath.replace(/^content\//, '').replace(/\.md$/, '');
        return ROUTE_RENAMES[route] ?? route;
      },
    });
  },
};
