import { Embedder, toVectorLiteral } from '@semver-sage/server-core';
import { numToVersion, versionToNum } from '@semver-sage/types';
import type { Pool } from 'pg';
import { chunkHash } from './chunker';
import { checkoutDocs } from './git';
import type { SourceAdapter, VersionSource } from './sources';

interface NewChunk {
  hash: string;
  sourcePath: string;
  urlPath: string;
  pageTitle: string;
  section: string;
  anchor: string | null;
  content: string;
}

export interface IngestStats {
  pages: number;
  chunks: number;
  extended: number;
  inserted: number;
  embedded: number;
}

const EMBED_BATCH = 32;
const INSERT_BATCH = 200;

const embeddingInput = (c: NewChunk) =>
  `${c.section === c.pageTitle ? c.pageTitle : `${c.pageTitle} > ${c.section}`}\n\n${c.content}`;

/**
 * Ingests one docs version. Versions must be ingested in ascending order per framework:
 * a chunk whose hash is live in the previous version gets its range extended instead of re-inserted.
 */
export async function ingestVersion(
  pool: Pool,
  embedder: Embedder,
  adapter: SourceAdapter,
  source: VersionSource,
  repoCacheDir: string,
  log: (msg: string) => void = console.log,
): Promise<IngestStats | null> {
  const { framework } = adapter;
  const versionNum = versionToNum(source.version);
  const label = `${framework}@${source.version}`;

  const { rows: done } = await pool.query<{ max: number | null; has: boolean }>(
    `SELECT max(version_num) AS max, bool_or(version_num = $2) AS has
       FROM doc_versions WHERE framework = $1`,
    [framework, versionNum],
  );
  const prevNum = done[0]?.max ?? null;
  if (done[0]?.has) {
    log(`${label}: already ingested, skipping`);
    return null;
  }
  if (prevNum !== null && versionNum < prevNum) {
    throw new Error(
      `${label}: ${framework}@${numToVersion(prevNum)} is already ingested. Versions must be ingested ` +
        `in ascending order; run "reset ${framework}" and ingest again.`,
    );
  }

  log(`${label}: checking out ${source.repo}@${source.ref}`);
  const { dir, commit } = await checkoutDocs(repoCacheDir, source.repo, source.ref, source.paths);
  const pages = await adapter.loadPages(dir, source);

  const chunks = new Map<string, NewChunk>();
  for (const page of pages) {
    for (const chunk of page.chunks) {
      const hash = chunkHash(page.urlPath, chunk);
      chunks.set(hash, {
        hash,
        sourcePath: page.sourcePath,
        urlPath: page.urlPath,
        pageTitle: chunk.pageTitle,
        section: chunk.section,
        anchor: chunk.anchor,
        content: chunk.text,
      });
    }
  }
  const hashes = [...chunks.keys()];
  log(`${label}: ${pages.length} pages, ${hashes.length} chunks (commit ${commit.slice(0, 7)})`);

  // Unchanged since the previous version -> extend the existing row's range.
  const { rows: live } = prevNum === null
    ? { rows: [] as { id: string; hash: string }[] }
    : await pool.query<{ id: string; hash: string }>(
        `SELECT id, hash FROM chunks
          WHERE framework = $1 AND last_version_num = $2 AND hash = ANY($3)`,
        [framework, prevNum, hashes],
      );
  const extendIds = live.map((r) => r.id);
  const liveHashes = new Set(live.map((r) => r.hash));
  const toInsert = hashes.filter((h) => !liveHashes.has(h)).map((h) => chunks.get(h) as NewChunk);

  // Text that existed in an older, non-adjacent version: reuse its embedding.
  const { rows: known } = await pool.query<{ hash: string; embedding: string }>(
    `SELECT DISTINCT ON (hash) hash, embedding::text AS embedding FROM chunks
      WHERE framework = $1 AND hash = ANY($2)`,
    [framework, toInsert.map((c) => c.hash)],
  );
  const embeddings = new Map(known.map((r) => [r.hash, r.embedding]));
  // Batches are padded to their longest text: grouping similar lengths avoids wasted compute.
  const toEmbed = toInsert
    .filter((c) => !embeddings.has(c.hash))
    .sort((a, b) => embeddingInput(a).length - embeddingInput(b).length);

  for (let i = 0; i < toEmbed.length; i += EMBED_BATCH) {
    const batch = toEmbed.slice(i, i + EMBED_BATCH);
    const vectors = await embedder.embedDocuments(batch.map(embeddingInput));
    batch.forEach((c, j) => embeddings.set(c.hash, toVectorLiteral(vectors[j])));
    log(`${label}: embedded ${Math.min(i + EMBED_BATCH, toEmbed.length)}/${toEmbed.length}`);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (extendIds.length) {
      await client.query(`UPDATE chunks SET last_version_num = $1 WHERE id = ANY($2::bigint[])`, [
        versionNum,
        extendIds,
      ]);
    }
    for (let i = 0; i < toInsert.length; i += INSERT_BATCH) {
      const batch = toInsert.slice(i, i + INSERT_BATCH);
      const col = <K extends keyof NewChunk>(key: K) => batch.map((c) => c[key]);
      await client.query(
        `INSERT INTO chunks (hash, framework, source_path, url_path, page_title, section, anchor,
                             content, embedding, first_version_num, last_version_num)
         SELECT h, $1, sp, up, pt, s, a, c, e::vector, $2, $2
           FROM unnest($3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[],
                       $9::text[], $10::text[]) AS t(h, sp, up, pt, s, a, c, e)`,
        [
          framework,
          versionNum,
          col('hash'),
          col('sourcePath'),
          col('urlPath'),
          col('pageTitle'),
          col('section'),
          col('anchor'),
          col('content'),
          batch.map((c) => embeddings.get(c.hash)),
        ],
      );
    }
    await client.query(
      `INSERT INTO doc_versions (framework, version_num, version, docs_base_url, source_repo,
                                 source_ref, source_commit, chunk_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [framework, versionNum, source.version, source.docsBaseUrl, source.repo, source.ref, commit, hashes.length],
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  const stats: IngestStats = {
    pages: pages.length,
    chunks: hashes.length,
    extended: extendIds.length,
    inserted: toInsert.length,
    embedded: toEmbed.length,
  };
  log(
    `${label}: done. ${stats.extended} unchanged (range extended), ${stats.inserted} new rows, ` +
      `${stats.embedded} embedded`,
  );
  return stats;
}

export async function resetFramework(pool: Pool, framework: string): Promise<void> {
  await pool.query(`DELETE FROM chunks WHERE framework = $1`, [framework]);
  await pool.query(`DELETE FROM doc_versions WHERE framework = $1`, [framework]);
}
