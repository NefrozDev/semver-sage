import { Framework } from './frameworks';

/** A chunk of documentation, valid for a contiguous range of indexed versions. */
export interface DocChunk {
  /** sha256 of the normalized chunk (url path + section + text). */
  hash: string;
  framework: Framework;
  /** Path of the source file inside the docs repo. */
  sourcePath: string;
  /** Path appended to the version's docs base URL, e.g. "guide/essentials/computed.html". */
  urlPath: string;
  pageTitle: string;
  /** Heading trail inside the page, e.g. "Computed Caching vs. Methods". */
  section: string;
  anchor: string | null;
  text: string;
  firstVersion: string;
  lastVersion: string;
}

export interface IndexedVersion {
  framework: Framework;
  version: string;
  docsBaseUrl: string;
  chunkCount: number;
  ingestedAt: string;
}

export interface AskRequest {
  question: string;
  /** Overrides detection from the question (e.g. from a framework picker or package.json). */
  framework?: Framework;
  version?: string;
  /** Compare mode: a second version of the same framework ("what changed between version and compareVersion?"). */
  compareVersion?: string;
}

/** What the question was scoped to, and how that was decided. */
export interface ResolvedScope {
  framework: Framework | null;
  /** Version the user asked for, if any ("2.6"). */
  requestedVersion: string | null;
  /** Indexed docs version actually searched ("2"), or null when searching latest of every framework. */
  version: string | null;
  source: 'request' | 'question' | 'latest' | 'none';
  /** Human-readable caveat, e.g. when the requested version is older than anything indexed. */
  note?: string;
}

export interface Citation {
  /** 1-based number the answer refers to as [n]. */
  n: number;
  framework: Framework;
  /** The docs version the URL points to. */
  version: string;
  /** Versions this exact text appears in. */
  firstVersion: string;
  lastVersion: string;
  url: string;
  pageTitle: string;
  section: string;
  snippet: string;
}

/** "Since when?" mode: every indexed version from `oldest` to the scope's version was searched. */
export interface HistoryScope {
  oldest: string;
  /** Oldest version whose docs mention the subject, or null when nothing was found. */
  earliest: string | null;
}

export type AskStreamEvent =
  /**
   * `compare` is set in compare mode: answers explain the change from `scope` to `compare`.
   * `history` is set in "since when?" mode.
   */
  | { type: 'scope'; scope: ResolvedScope; compare?: ResolvedScope; history?: HistoryScope }
  | { type: 'citations'; citations: Citation[] }
  | { type: 'token'; text: string }
  | { type: 'done'; model: string; elapsedMs: number }
  | { type: 'error'; message: string };
