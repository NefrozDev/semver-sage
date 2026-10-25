import type { Framework } from '@semver-sage/types';
import type { PageChunk } from '../chunker';

/** One docs version: where to fetch it and where it is published. */
export interface VersionSource {
  /** Version label as indexed, e.g. "2" or "20.11". */
  version: string;
  /** GitHub "owner/name". */
  repo: string;
  /** Git tag or branch holding this version's docs. */
  ref: string;
  /** Folders to check out (sparse), relative to the repo root. */
  paths: string[];
  /** Citation URL = docsBaseUrl + page urlPath. */
  docsBaseUrl: string;
}

export interface SourcePage {
  /** Path of the file in the repo. */
  sourcePath: string;
  /** Path appended to `docsBaseUrl` (no anchor). */
  urlPath: string;
  chunks: PageChunk[];
}

/** Knows the layout of one framework's docs repo(s). */
export interface SourceAdapter {
  framework: Framework;
  /** In ascending version order. */
  versions: VersionSource[];
  /** Reads and chunks every docs page from a checkout of `source`. */
  loadPages(checkoutDir: string, source: VersionSource): Promise<SourcePage[]>;
}
