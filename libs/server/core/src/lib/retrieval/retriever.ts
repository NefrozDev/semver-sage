import type { Citation, Framework, IndexedVersion } from '@semver-sage/types';
import type { Pool } from 'pg';
import { toVectorLiteral } from '../db';
import type { Embedder, Reranker } from '../models';
import { reciprocalRankFusion } from './rrf';
import type { IndexedVersionRow, SearchScope } from './scope';

export interface RetrieveOptions {
  /** Postgres full-text search. */
  keyword?: boolean;
  /** pgvector similarity search. */
  vector?: boolean;
  /** Cross-encoder rerank of the fused candidates (needs a Reranker). */
  rerank?: boolean;
  /** Restrict to the scope's framework + version. Off = search every chunk of every version. */
  versionFilter?: boolean;
  topK?: number;
}

const DEFAULTS: Required<RetrieveOptions> = {
  keyword: true,
  vector: true,
  rerank: true,
  versionFilter: true,
  topK: 6,
};

interface Hit {
  id: string;
  versionNum: number;
}

interface ChunkDetails {
  id: string;
  framework: Framework;
  page_title: string;
  section: string;
  anchor: string | null;
  content: string;
  url_path: string;
  version: string;
  docs_base_url: string;
  first_version: string;
  last_version: string;
}

const CANDIDATES_PER_RETRIEVER = 40;
const RERANK_POOL = 24;

/** Hybrid search (full-text + vector) -> RRF -> cross-encoder rerank -> top-k citations. */
export class Retriever {
  constructor(
    private readonly pool: Pool,
    private readonly embedder: Embedder,
    private readonly reranker: Reranker | null,
    private readonly log: (msg: string) => void = console.warn,
  ) {}

  async indexedVersions(): Promise<(IndexedVersionRow & IndexedVersion)[]> {
    const { rows } = await this.pool.query(
      `SELECT framework, version, version_num AS "versionNum", docs_base_url AS "docsBaseUrl",
              chunk_count AS "chunkCount", ingested_at AS "ingestedAt"
         FROM doc_versions ORDER BY framework, version_num`,
    );
    return rows;
  }

  async search(question: string, scope: SearchScope, options: RetrieveOptions = {}): Promise<Citation[]> {
    // Skip undefined options: `{ topK: undefined }` must not override the default.
    const given = Object.fromEntries(Object.entries(options).filter(([, value]) => value !== undefined));
    const opts: Required<RetrieveOptions> = { ...DEFAULTS, ...given };
    if (opts.versionFilter && scope.framework && scope.versionNum === null) return [];

    // Scope rows: one (framework, version) pair, or the latest version of every framework.
    const scopeSql = scope.versionNum !== null
      ? `SELECT $1::text AS framework, $2::int AS v`
      : `SELECT framework, max(version_num) AS v FROM doc_versions GROUP BY framework`;
    const scopeParams = opts.versionFilter && scope.versionNum !== null ? [scope.framework, scope.versionNum] : [];
    const n = scopeParams.length;
    const ctes = opts.versionFilter ? [`scope AS (${scopeSql})`] : [];
    const from = opts.versionFilter
      ? `chunks c JOIN scope s ON s.framework = c.framework
           AND c.first_version_num <= s.v AND c.last_version_num >= s.v`
      : `chunks c`;
    // Unfiltered hits cite the newest version their text appears in.
    const version = opts.versionFilter ? 's.v' : 'c.last_version_num';
    const withClause = (extra: string[] = []) =>
      [...ctes, ...extra].length ? `WITH ${[...ctes, ...extra].join(', ')}` : '';

    const lists: Promise<Hit[]>[] = [];
    if (opts.vector) {
      const embedding = await this.embedder.embedQuery(question);
      lists.push(
        this.pool
          .query<Hit>(
            `${withClause()}
             SELECT c.id, ${version} AS "versionNum" FROM ${from}
              ORDER BY c.embedding <=> $${n + 1}::vector LIMIT ${CANDIDATES_PER_RETRIEVER}`,
            [...scopeParams, toVectorLiteral(embedding)],
          )
          .then((r) => r.rows),
      );
    }
    if (opts.keyword) {
      // OR the question's terms together: natural-language questions rarely match every word.
      const q = `q AS (SELECT to_tsquery('english',
                   nullif(replace(plainto_tsquery('english', $${n + 1})::text, '&', '|'), '')) AS q)`;
      lists.push(
        this.pool
          .query<Hit>(
            `${withClause([q])}
             SELECT c.id, ${version} AS "versionNum" FROM ${from}, q
              WHERE c.tsv @@ q.q
              ORDER BY ts_rank_cd(c.tsv, q.q) DESC LIMIT ${CANDIDATES_PER_RETRIEVER}`,
            [...scopeParams, question],
          )
          .then((r) => r.rows),
      );
    }

    const fused = reciprocalRankFusion(await Promise.all(lists), (h) => h.id)
      .slice(0, opts.rerank && this.reranker ? RERANK_POOL : opts.topK)
      .map((f) => f.item);
    if (!fused.length) return [];

    const { rows } = await this.pool.query<ChunkDetails>(
      `SELECT c.id, c.framework, c.page_title, c.section, c.anchor, c.content, c.url_path,
              dv.version, dv.docs_base_url, fv.version AS first_version, lv.version AS last_version
         FROM unnest($1::bigint[], $2::int[]) AS t(id, v)
         JOIN chunks c ON c.id = t.id
         JOIN doc_versions dv ON dv.framework = c.framework AND dv.version_num = t.v
         JOIN doc_versions fv ON fv.framework = c.framework AND fv.version_num = c.first_version_num
         JOIN doc_versions lv ON lv.framework = c.framework AND lv.version_num = c.last_version_num`,
      [fused.map((h) => h.id), fused.map((h) => h.versionNum)],
    );
    const byId = new Map(rows.map((r) => [r.id, r]));
    const candidates = fused.map((h) => byId.get(h.id)).filter((r): r is ChunkDetails => !!r);
    const ranked = opts.rerank ? await this.rerank(question, candidates) : candidates;

    return ranked.slice(0, opts.topK).map((c, i) => ({
      n: i + 1,
      framework: c.framework,
      version: c.version,
      firstVersion: c.first_version,
      lastVersion: c.last_version,
      url: `${c.docs_base_url}${c.url_path}${c.anchor ? `#${c.anchor}` : ''}`,
      pageTitle: c.page_title,
      section: c.section,
      snippet: c.content,
    }));
  }

  private async rerank(question: string, candidates: ChunkDetails[]): Promise<ChunkDetails[]> {
    if (!this.reranker) return candidates;
    try {
      const scores = await this.reranker.score(
        question,
        candidates.map((c) => `${c.page_title} > ${c.section}\n${c.content}`),
      );
      return candidates
        .map((c, i) => ({ c, score: scores[i] }))
        .sort((a, b) => b.score - a.score)
        .map(({ c }) => c);
    } catch (err) {
      this.log(`Rerank skipped: ${err}`);
      return candidates;
    }
  }
}
