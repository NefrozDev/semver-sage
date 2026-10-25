import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Embedder, getConfig, Reranker, toVectorLiteral } from '@semver-sage/server-core';
import type { Citation, Framework, IndexedVersion } from '@semver-sage/types';
import { DatabaseService } from '../database.service';
import { reciprocalRankFusion } from './rrf';
import { IndexedVersionRow, SearchScope } from './scope';

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
const TOP_K = 6;

@Injectable()
export class RetrievalService implements OnApplicationBootstrap {
  private readonly logger = new Logger(RetrievalService.name);
  private readonly config = getConfig();
  private readonly embedder = new Embedder(this.config.embeddingModel, this.config.modelCacheDir);
  private readonly reranker = this.config.rerankEnabled
    ? new Reranker(this.config.rerankerModel, this.config.modelCacheDir)
    : null;

  constructor(private readonly db: DatabaseService) {}

  /** Loads models in the background so the first question isn't slow. */
  onApplicationBootstrap() {
    this.embedder.warmUp().catch((err) => this.logger.error(`Embedder failed to load: ${err}`));
    this.reranker?.warmUp().catch((err) => this.logger.error(`Reranker failed to load: ${err}`));
  }

  async indexedVersions(): Promise<(IndexedVersionRow & IndexedVersion)[]> {
    const { rows } = await this.db.pool.query(
      `SELECT framework, version, version_num AS "versionNum", docs_base_url AS "docsBaseUrl",
              chunk_count AS "chunkCount", ingested_at AS "ingestedAt"
         FROM doc_versions ORDER BY framework, version_num`,
    );
    return rows;
  }

  /** Hybrid search (full-text + vector) -> RRF -> cross-encoder rerank -> top-k citations. */
  async search(question: string, scope: SearchScope): Promise<Citation[]> {
    if (scope.framework && scope.versionNum === null) return [];

    // Rows of the scope CTE: one (framework, version) pair, or the latest version of each framework.
    const scopeSql = scope.versionNum !== null
      ? `SELECT $1::text AS framework, $2::int AS v`
      : `SELECT framework, max(version_num) AS v FROM doc_versions GROUP BY framework`;
    const scopeParams = scope.versionNum !== null ? [scope.framework, scope.versionNum] : [];
    const n = scopeParams.length;
    const inScope = `JOIN scope s ON s.framework = c.framework
                     AND c.first_version_num <= s.v AND c.last_version_num >= s.v`;

    const embedding = await this.embedder.embedQuery(question);
    const [vector, keyword] = await Promise.all([
      this.db.pool.query<Hit>(
        `WITH scope AS (${scopeSql})
         SELECT c.id, s.v AS "versionNum" FROM chunks c ${inScope}
          ORDER BY c.embedding <=> $${n + 1}::vector LIMIT ${CANDIDATES_PER_RETRIEVER}`,
        [...scopeParams, toVectorLiteral(embedding)],
      ),
      // OR the question's terms together: natural-language questions rarely match every word.
      this.db.pool.query<Hit>(
        `WITH scope AS (${scopeSql}),
              q AS (SELECT to_tsquery('english',
                      nullif(replace(plainto_tsquery('english', $${n + 1})::text, '&', '|'), '')) AS q)
         SELECT c.id, s.v AS "versionNum" FROM chunks c ${inScope}, q
          WHERE c.tsv @@ q.q
          ORDER BY ts_rank_cd(c.tsv, q.q) DESC LIMIT ${CANDIDATES_PER_RETRIEVER}`,
        [...scopeParams, question],
      ),
    ]);

    const fused = reciprocalRankFusion([vector.rows, keyword.rows], (h) => h.id)
      .slice(0, RERANK_POOL)
      .map((f) => f.item);
    if (!fused.length) return [];

    const { rows } = await this.db.pool.query<ChunkDetails>(
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

    const top = (await this.rerank(question, candidates)).slice(0, TOP_K);
    return top.map((c, i) => ({
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
      this.logger.warn(`Rerank skipped: ${err}`);
      return candidates;
    }
  }
}
