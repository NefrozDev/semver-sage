import type { Citation, Framework, IndexedVersion } from '@semver-sage/types';
import type { Pool } from 'pg';
import { toVectorLiteral } from '../db';
import type { Embedder } from '../models';
import {
  EvidenceLevel,
  HistoryHit,
  isApiName,
  isEvidence,
  relevantHits,
  selectHistory,
  subjectLikePatterns,
  subjectPattern,
} from './history';
import type { IndexedVersionRow, SearchScope } from './scope';

/**
 * A base URL holding this placeholder links to the chunk's source file instead of appending its URL
 * path: docs cited on GitHub for old versions keep the site's URL path, so their chunks still
 * dedupe with the versions cited on the docs site (NestJS 6-11 on GitHub, 12 on docs.nestjs.com).
 */
export const SOURCE_PLACEHOLDER = '{source}';

export function citationUrl(base: string, urlPath: string, sourcePath: string, anchor: string | null): string {
  const page = base.includes(SOURCE_PLACEHOLDER) ? base.replace(SOURCE_PLACEHOLDER, sourcePath) : base + urlPath;
  return anchor ? `${page}#${anchor}` : page;
}

/** Vector hits considered for a "since when?" question, across every version. */
const HISTORY_CANDIDATES = 60;
/** Pages whose older versions are searched literally for the subject. */
const HISTORY_PAGES = 5;

export interface HistoryResult {
  citations: Citation[];
  /** Oldest indexed version whose docs mention the subject, or null when nothing was found. */
  earliest: string | null;
  /** Oldest indexed version of the framework: the answer can't go further back. */
  oldest: string;
}

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
  source_path: string;
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
      SELECT c.framework, c.page_title, c.section, c.anchor, c.content, c.url_path, c.source_path,
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
      sql = `SELECT c.framework, c.page_title, c.section, c.anchor, c.content, c.url_path, c.source_path,
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
      url: citationUrl(c.docs_base_url, c.url_path, c.source_path, c.anchor),
      pageTitle: c.page_title,
      section: c.section,
      snippet: c.content,
    }));
  }

  /**
   * "Since when?" search: every indexed version of the framework up to the scope's version. Returns
   * the oldest evidence of the question's subject plus the closest hits, oldest first. `topics` are
   * the subjects to try, most specific first (`sinceTopics`).
   */
  async searchHistory(question: string, topics: string[], scope: SearchScope): Promise<HistoryResult | null> {
    if (!scope.framework || scope.versionNum === null) return null;
    const { rows: versions } = await this.pool.query<{ num: number; version: string; base: string }>(
      `SELECT version_num AS num, version, docs_base_url AS base
         FROM doc_versions WHERE framework = $1 AND version_num <= $2 ORDER BY version_num`,
      [scope.framework, scope.versionNum],
    );
    if (!versions.length) return null;
    const byNum = new Map(versions.map((v) => [Number(v.num), v]));

    const embedding = toVectorLiteral(await this.embedder.embedQuery(question));
    const { rows } = await this.pool.query<HistoryHit>(
      `SELECT ${HIT_COLUMNS} FROM chunks c
        WHERE c.framework = $2 AND c.first_version_num <= $3
        ORDER BY c.embedding <=> $1::vector LIMIT ${HISTORY_CANDIDATES}`,
      [embedding, scope.framework, scope.versionNum],
    );
    const candidates = rows.map(toNumbers);
    let topic = topics[0] ?? question;
    let found = relevantHits(candidates, subjectPattern(topic));
    for (const other of topics.slice(1)) {
      if (found.level !== 'similar') break;
      topic = other;
      found = relevantHits(candidates, subjectPattern(topic));
    }
    const { hits: relevant, level } = found;
    const older =
      level === 'similar' ? [] : await this.olderEvidence(embedding, scope.framework, topic, relevant, level);

    const { earliestNum, picks } = selectHistory(relevant, older, scope.versionNum);
    const label = (num: number) => byNum.get(num)?.version ?? String(num);
    const citations = picks.map(({ hit, citeNum }, i): Citation => ({
      n: i + 1,
      framework: scope.framework as Framework,
      version: label(citeNum),
      firstVersion: label(hit.firstVersionNum),
      lastVersion: label(hit.lastVersionNum),
      url: citationUrl(byNum.get(citeNum)?.base ?? '', hit.urlPath, hit.sourcePath, hit.anchor),
      pageTitle: hit.pageTitle,
      section: hit.section,
      snippet: hit.content,
    }));
    return {
      citations,
      earliest: earliestNum === null ? null : label(earliestNum),
      oldest: versions[0].version,
    };
  }

  /**
   * Evidence older than the vector hits, found literally: older versions of the same pages word the
   * subject differently enough to miss the vector top list (Node 16's "fetch" section), and an API
   * name counts on any page (Next.js 9 documents getServerSideProps elsewhere than 13).
   */
  private async olderEvidence(
    embedding: string,
    framework: Framework,
    topic: string,
    relevant: HistoryHit[],
    level: EvidenceLevel,
  ): Promise<HistoryHit[]> {
    const subject = subjectPattern(topic);
    const likes = subjectLikePatterns(topic);
    if (!subject || !likes.length || !relevant.length) return [];
    const earliest = Math.min(...relevant.map((h) => h.firstVersionNum));
    const pages = [...new Set(relevant.map((h) => h.urlPath))].slice(0, HISTORY_PAGES);
    const apiName = isApiName(topic);
    const { rows } = await this.pool.query<HistoryHit>(
      `SELECT ${HIT_COLUMNS} FROM chunks c
        WHERE c.framework = $2 AND c.first_version_num < $3 AND ($6 OR c.url_path = ANY($4::text[]))
          AND (c.page_title || ' ' || c.section || ' ' || c.content) ILIKE ALL($5::text[])
        ORDER BY c.first_version_num, c.embedding <=> $1::vector LIMIT 20`,
      [embedding, framework, earliest, pages, likes, apiName],
    );
    return rows
      .map(toNumbers)
      .filter((h) => isEvidence(h, subject, pages.includes(h.urlPath) || !apiName ? level : 'text'));
  }
}

const HIT_COLUMNS = `c.id::text AS id, 1 - (c.embedding <=> $1::vector) AS sim,
    c.first_version_num AS "firstVersionNum", c.last_version_num AS "lastVersionNum",
    c.url_path AS "urlPath", c.source_path AS "sourcePath", c.page_title AS "pageTitle",
    c.section, c.anchor, c.content`;

/** pg returns bigint/numeric columns as strings. */
const toNumbers = (h: HistoryHit): HistoryHit => ({
  ...h,
  sim: Number(h.sim),
  firstVersionNum: Number(h.firstVersionNum),
  lastVersionNum: Number(h.lastVersionNum),
});
