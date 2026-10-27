import { posix } from 'node:path';
import { parse } from 'yaml';
import { trimChar } from '../chunker';
import { latestPerMajor, latestPerMinor, listReleaseTags, ReleaseTag } from '../git';
import { loadMarkdownPages } from './markdown-repo';
import type { SourceAdapter, VersionSource } from './types';

const REPO = 'nodejs/node';
const MIN_MAJOR = 1;
const LAST_IOJS_MAJOR = 3;
/** Before io.js, stable Node lines were the even 0.x minors; 0.8 is the oldest one worth indexing. */
const isLegacyStableLine = (t: ReleaseTag) => t.major === 0 && t.minor >= 8 && t.minor % 2 === 0;
const SKIP_PAGES = new Set(['index', 'all', '_toc']);

/** "doc/api/child_process.markdown" -> "child_process" */
const pageName = (sourcePath: string) => posix.basename(sourcePath).replace(/\.(md|markdown)$/, '');

const list = (value: unknown): string =>
  (Array.isArray(value) ? value : [value]).filter((v) => v !== undefined && v !== null).join(', ');

interface NodeYaml {
  added?: string | string[];
  deprecated?: string | string[];
  removed?: string | string[];
  napiVersion?: string | string[];
  changes?: { version?: string | string[]; description?: string }[];
}

/**
 * Node keeps API history in `<!-- YAML ... -->` comments. Render them like nodejs.org does
 * ("Added in: v17.5.0" plus a history list) so "since when?" questions can be answered.
 */
export function renderNodeMetadata(markdown: string): string {
  return markdown
    .replace(/<!--[ \t]*YAML[ \t]*\n([\s\S]*?)-->/g, (_, body: string) => {
      let meta: NodeYaml;
      try {
        meta = (parse(body) ?? {}) as NodeYaml;
      } catch {
        return '';
      }
      const lines: string[] = [];
      if (meta.added) lines.push(`*Added in: ${list(meta.added)}*`);
      if (meta.deprecated) lines.push(`*Deprecated since: ${list(meta.deprecated)}*`);
      if (meta.removed) lines.push(`*Removed in: ${list(meta.removed)}*`);
      if (meta.napiVersion) lines.push(`*N-API version: ${list(meta.napiVersion)}*`);
      const changes = (meta.changes ?? []).filter((c) => c.version && c.description);
      if (changes.length) {
        lines.push('', 'History:', ...changes.map((c) => `- ${list(c.version)}: ${c.description?.replace(/\s+/g, ' ')}`));
      }
      return lines.length ? `\n${lines.join('\n')}\n` : '';
    })
    .replace(/<!--\s*introduced_in=(v[\d.]+)\s*-->/g, '*Introduced in: $1*')
    // Reference-style link definitions at the end of each page are noise for retrieval.
    .replace(/^\[[^\]\n]+\]:[ \t]+\S.*$/gm, '');
}

/** nodejs.org's stable "legacy" anchors: "fs" + "`fs.readFile(path[, options])`" -> "fs_fs_readfile_path_options". */
export function nodeLegacyId(heading: string, sourcePath: string): string {
  const module = pageName(sourcePath).replace(/-/g, '_');
  const slug = trimChar(heading.toLowerCase().replace(/[^a-z0-9]+/g, '_'), '_');
  return `${module}_${slug}`;
}

/**
 * Node.js API docs from nodejs/node `doc/api`: the 0.8, 0.10 and 0.12 lines, then the newest release
 * of every major since 1. Majors 1–3 were io.js (the fork that merged back as Node 4); their docs
 * are cited on iojs.org.
 */
export function nodeVersions(tags: ReleaseTag[]): VersionSource[] {
  const lines = [...latestPerMinor(tags, isLegacyStableLine), ...latestPerMajor(tags, (t) => t.major >= MIN_MAJOR)];
  return lines.map((t) => ({
    version: t.major === 0 ? `0.${t.minor}` : String(t.major),
    repo: REPO,
    ref: t.tag,
    paths: ['doc/api'],
    docsBaseUrl:
      t.major >= 1 && t.major <= LAST_IOJS_MAJOR
        ? `https://iojs.org/dist/${t.tag}/doc/`
        : `https://nodejs.org/docs/${t.tag}/`,
  }));
}

export const nodeAdapter: SourceAdapter = {
  framework: 'node',

  async versions() {
    return nodeVersions(await listReleaseTags(REPO));
  },

  loadPages(checkoutDir, source) {
    return loadMarkdownPages(checkoutDir, source, {
      // io.js and early Node used ".markdown"
      extensions: ['.md', '.markdown'],
      // Methods live at h3/h4 ("Class: FileHandle" > "filehandle.read()").
      splitDepth: 4,
      slugify: nodeLegacyId,
      preprocess: renderNodeMetadata,
      // "doc/api/fs.md" -> "api/fs.html"
      toUrlPath: (sourcePath) =>
        SKIP_PAGES.has(pageName(sourcePath)) ? null : `api/${pageName(sourcePath)}.html`,
    });
  },
};
