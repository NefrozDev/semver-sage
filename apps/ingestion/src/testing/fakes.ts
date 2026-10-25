import { EMBEDDING_DIM } from '@semver-sage/server-core';
import type { PageChunk } from '../chunker';
import type { SourceAdapter, SourcePage, VersionSource } from '../sources';

/**
 * Deterministic bag-of-words "embedding": texts sharing words are close, so search ordering is
 * predictable, and no model is downloaded.
 */
export function fakeEmbedding(text: string): number[] {
  const vector = new Array<number>(EMBEDDING_DIM).fill(0);
  for (const word of text.toLowerCase().match(/[a-z]+/g) ?? ['empty']) {
    let h = 0;
    for (const char of word) h = (h * 31 + char.charCodeAt(0)) >>> 0;
    vector[h % EMBEDDING_DIM] += 1;
  }
  const norm = Math.hypot(...vector) || 1;
  return vector.map((v) => v / norm);
}

export class FakeEmbedder {
  /** Every text sent for embedding, in order. */
  readonly embedded: string[] = [];

  async embedDocuments(texts: string[]): Promise<number[][]> {
    this.embedded.push(...texts);
    return texts.map(fakeEmbedding);
  }

  async embedQuery(text: string): Promise<number[]> {
    return fakeEmbedding(text);
  }
}

/** A docs page with one chunk per section ("" = the page intro). */
export function page(urlPath: string, title: string, sections: Record<string, string>): SourcePage {
  const chunks: PageChunk[] = Object.entries(sections).map(([section, text]) => ({
    pageTitle: title,
    section: section || title,
    anchor: section ? section.toLowerCase().replace(/\W+/g, '-') : null,
    text,
  }));
  return { sourcePath: `docs/${urlPath}.md`, urlPath, chunks };
}

export const versionSource = (version: string): VersionSource => ({
  version,
  repo: 'test/docs',
  ref: `v${version}`,
  paths: ['docs'],
  docsBaseUrl: `https://docs.test/v${version}/`,
});

/** An adapter whose versions and pages are given up front; no git, no files. */
export function fakeAdapter(pagesByVersion: Record<string, SourcePage[]>): SourceAdapter {
  return {
    framework: 'vue',
    versions: async () => Object.keys(pagesByVersion).map(versionSource),
    loadPages: async (_dir, source) => pagesByVersion[source.version] ?? [],
  };
}

export const fakeCheckout = async (source: VersionSource) => ({ dir: '/nowhere', commit: `commit-${source.version}` });
