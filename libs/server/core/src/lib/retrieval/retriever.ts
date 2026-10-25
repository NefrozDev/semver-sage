import type { Citation, Framework, IndexedVersion } from '@semver-sage/types';
import type { Pool } from 'pg';
import { toVectorLiteral } from '../db';
import type { Embedder } from '../models';
import type { IndexedVersionRow, SearchScope } from './scope';

export interface RetrieveOptions {
  /** Restrict to the scope's framework + version. Off = search every chunk of every version. */
  versionFilter?: boolean;
  topK?: number;
}

const DEFAULTS: Required<RetrieveOptions> = {
  versionFilter: true,
  topK: 6,
};

interface ChunkRow {
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

/**
 * Vector search restricted to the asked framework + version. Full-text search (fused with RRF)
 * and a cross-encoder reranker were measured and dropped: on the golden set they matched vector
 * search alone while adding ~6 s per question (evals/results/hybrid-rerank-ablation.md).
 */
export class Retriever {
  constructor(
    private readonly pool: Pool,
    private readonly embedder: Pick<Embedder, 'embedQuery'>,
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

    const embedding = toVectorLiteral(await this.embedder.embedQuery(question));
    let sql: string;
    let params: unknown[];
    if (opts.versionFilter) {
      // Scope rows: one (framework, version) pair, or the latest version of every framework.
      const scoped = scope.versionNum !== null;
      sql = `WITH scope AS (${
        scoped
          ? `SELECT $2::text AS framework, $3::int AS v`
          : `SELECT framework, max(version_num) AS v FROM doc_versions GROUP BY framework`
      })
      SELECT c.framework, c.page_title, c.section, c.anchor, c.content, c.url_path,
             dv.version, dv.docs_base_url, fv.version AS first_version, lv.version AS last_version
        FROM chunks c
        JOIN scope s ON s.framework = c.framework AND c.first_version_num <= s.v AND c.last_version_num >= s.v
        JOIN doc_versions dv ON dv.framework = c.framework AND dv.version_num = s.v
        JOIN doc_versions fv ON fv.framework = c.framework AND fv.version_num = c.first_version_num
        JOIN doc_versions lv ON lv.framework = c.framework AND lv.version_num = c.last_version_num
       ORDER BY c.embedding <=> $1::vector
       LIMIT ${opts.topK}`;
      params = scoped ? [embedding, scope.framework, scope.versionNum] : [embedding];
    } else {
      // Unfiltered (ablation baseline): hits cite the newest version their text appears in.
      sql = `SELECT c.framework, c.page_title, c.section, c.anchor, c.content, c.url_path,
                    lv.version, lv.docs_base_url, fv.version AS first_version, lv.version AS last_version
               FROM chunks c
               JOIN doc_versions fv ON fv.framework = c.framework AND fv.version_num = c.first_version_num
               JOIN doc_versions lv ON lv.framework = c.framework AND lv.version_num = c.last_version_num
              ORDER BY c.embedding <=> $1::vector
              LIMIT ${opts.topK}`;
      params = [embedding];
    }

    const { rows } = await this.pool.query<ChunkRow>(sql, params);
    return rows.map((c, i) => ({
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
}
