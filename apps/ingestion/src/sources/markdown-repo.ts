import { readdir, readFile } from 'node:fs/promises';
import { join, posix, relative, sep } from 'node:path';
import { chunkMarkdown, ChunkOptions } from '../chunker';
import type { SourcePage, VersionSource } from './types';

export interface MarkdownRepoOptions extends ChunkOptions {
  /** Maps a repo-relative .md path to its published URL path, or null to skip the file. */
  toUrlPath: (sourcePath: string, source: VersionSource) => string | null;
}

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const nested = await Promise.all(
    entries.map((e) => {
      const full = join(dir, e.name);
      if (e.isDirectory()) return walk(full);
      return Promise.resolve(e.name.endsWith('.md') ? [full] : []);
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
  const files = (await Promise.all(source.paths.map((p) => walk(join(checkoutDir, p))))).flat();
  const pages: SourcePage[] = [];
  for (const file of files.sort()) {
    const sourcePath = relative(checkoutDir, file).split(sep).join(posix.sep);
    const urlPath = options.toUrlPath(sourcePath, source);
    if (urlPath === null) continue;
    const chunks = chunkMarkdown(await readFile(file, 'utf8'), options);
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
