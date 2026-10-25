import { readdir, readFile } from 'node:fs/promises';
import { join, posix, relative, sep } from 'node:path';
import { chunkMarkdown, ChunkOptions } from '../chunker';
import type { SourcePage, VersionSource } from './types';

export interface MarkdownRepoOptions extends Omit<ChunkOptions, 'slugify'> {
  /** Turns a heading into the anchor id the docs site generates (some sites prefix the page name). */
  slugify: (heading: string, sourcePath: string, parents: string[]) => string;
  /** Maps a repo-relative doc path (and its raw content) to its published URL path, or null to skip it. */
  toUrlPath: (sourcePath: string, source: VersionSource, markdown: string) => string | null;
  /** Rewrites site-specific markup into plain markdown before chunking; null skips the page. */
  preprocess?: (markdown: string, sourcePath: string) => string | null;
  /** File extensions to load (default: .md). */
  extensions?: string[];
}

async function walk(dir: string, extensions: string[]): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const nested = await Promise.all(
    entries.map((e) => {
      const full = join(dir, e.name);
      if (e.isDirectory()) return walk(full, extensions);
      return Promise.resolve(extensions.some((ext) => e.name.endsWith(ext)) ? [full] : []);
    }),
  );
  return nested.flat();
}

/** Loads every markdown page under the source's paths: the common case for docs repos. */
export async function loadMarkdownPages(
  checkoutDir: string,
  source: VersionSource,
  options: MarkdownRepoOptions,
): Promise<SourcePage[]> {
  const { slugify, toUrlPath, preprocess, extensions = ['.md'], ...chunkOptions } = options;
  const files = (await Promise.all(source.paths.map((p) => walk(join(checkoutDir, p), extensions)))).flat();
  const pages: SourcePage[] = [];
  for (const file of files.sort((a, b) => a.localeCompare(b))) {
    const sourcePath = relative(checkoutDir, file).split(sep).join(posix.sep);
    const raw = await readFile(file, 'utf8');
    const urlPath = toUrlPath(sourcePath, source, raw);
    if (urlPath === null) continue;
    const markdown = preprocess ? preprocess(raw, sourcePath) : raw;
    if (markdown === null) continue;
    const chunks = chunkMarkdown(markdown, {
      ...chunkOptions,
      slugify: (heading, parents) => slugify(heading, sourcePath, parents),
    });
    if (chunks.length) pages.push({ sourcePath, urlPath, chunks });
  }
  return pages;
}

/** "src/guide/essentials/computed.md" minus "src/" -> "guide/essentials/computed.html" */
export function htmlUrlPath(sourcePath: string, stripPrefix: string): string {
  const path = sourcePath.slice(stripPrefix.length).replace(/\.md$/, '');
  if (path === 'index') return '';
  return path.endsWith('/index') ? path.slice(0, -'index'.length) : `${path}.html`;
}

/** A frontmatter field, e.g. `permalink: docs/hooks-intro.html`. */
export function frontmatterField(markdown: string, field: string): string | null {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown)?.[1];
  const value = frontmatter && new RegExp(`^${field}:\\s*['"]?(.+?)['"]?\\s*$`, 'm').exec(frontmatter)?.[1];
  return value || null;
}

/** "1.getting-started/02.installation.md" -> "getting-started/installation" (Nuxt, Svelte, Next.js). */
export function stripOrderPrefixes(path: string): string {
  return path
    .replace(/\.mdx?$/, '')
    .split('/')
    .map((segment) => segment.replace(/^\d+[.-]/, ''))
    .join('/')
    .replace(/(^|\/)index$/, '');
}

/** Docs without a versioned site: cite the file on GitHub at the exact release tag. */
export const githubBlobBase = (repo: string, ref: string) => `https://github.com/${repo}/blob/${ref}/`;
