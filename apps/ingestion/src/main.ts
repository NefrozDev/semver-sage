#!/usr/bin/env tsx
// @nx-target-name: serve
import { createPool, Embedder, getConfig, runMigrations } from '@semver-sage/server-core';
import { FRAMEWORK_IDS, isFramework } from '@semver-sage/types';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { finishRebuild, ingestVersion, resetFramework, startRebuild } from './ingest';
import { ADAPTERS, SourceAdapter } from './sources';

const USAGE = `Usage: ingestion <command>

  migrate                          apply db/migrations
  ingest <framework|all> [--version v]
                                   ingest every release the adapter lists (or one);
                                   already-ingested versions are skipped
  rebuild <framework>              re-ingest every version in order (to add older or in-between
                                   versions), reusing existing embeddings
  versions <framework>             list the versions an adapter would ingest
  reset <framework>                delete a framework's chunks and versions
  status                           show what is indexed

Frameworks: ${FRAMEWORK_IDS.join(', ')}`;

function adapterFor(target: string | undefined): SourceAdapter {
  if (!isFramework(target)) throw new Error(`Unknown framework "${target}". One of: ${FRAMEWORK_IDS.join(', ')}`);
  return ADAPTERS[target];
}

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: { version: { type: 'string' } },
  });
  const [command, target] = positionals;
  const config = getConfig();
  const pool = createPool(config.databaseUrl);

  try {
    switch (command) {
      case 'migrate': {
        const ran = await runMigrations(pool, resolve('db/migrations'));
        console.log(ran.length ? `Applied ${ran.length} migration(s)` : 'Database is up to date');
        break;
      }
      case 'ingest': {
        const adapters = target === 'all' ? Object.values(ADAPTERS) : [adapterFor(target)];
        const embedder = new Embedder(config.embeddingModel, config.modelCacheDir);
        for (const adapter of adapters) {
          const all = await adapter.versions({ repoCacheDir: config.repoCacheDir });
          const versions = values.version ? all.filter((v) => v.version === values.version) : all;
          if (!versions.length) throw new Error(`${adapter.framework} has no version "${values.version}"`);
          for (const source of versions) {
            await ingestVersion(pool, embedder, adapter, source, { repoCacheDir: config.repoCacheDir });
          }
        }
        break;
      }
      case 'rebuild': {
        const adapter = adapterFor(target);
        const versions = await adapter.versions({ repoCacheDir: config.repoCacheDir });
        const parked = await startRebuild(pool, adapter.framework);
        console.log(`${adapter.framework}: parked ${parked} embeddings, re-ingesting ${versions.length} versions in order`);
        const embedder = new Embedder(config.embeddingModel, config.modelCacheDir);
        for (const source of versions) {
          await ingestVersion(pool, embedder, adapter, source, { repoCacheDir: config.repoCacheDir });
        }
        await finishRebuild(pool, adapter.framework);
        break;
      }
      case 'versions': {
        console.table(await adapterFor(target).versions({ repoCacheDir: config.repoCacheDir }));
        break;
      }
      case 'reset': {
        if (!isFramework(target)) throw new Error(`Unknown framework "${target}"`);
        await resetFramework(pool, target);
        console.log(`Removed all ${target} chunks`);
        break;
      }
      case 'status': {
        const { rows } = await pool.query(`
          SELECT v.framework, v.version, v.chunk_count AS chunks_in_version,
                 v.source_ref, left(v.source_commit, 7) AS commit,
                 to_char(v.ingested_at, 'YYYY-MM-DD HH24:MI') AS ingested
            FROM doc_versions v ORDER BY v.framework, v.version_num`);
        const { rows: totals } = await pool.query(`
          SELECT framework, count(*)::int AS stored_rows FROM chunks GROUP BY framework ORDER BY 1`);
        console.table(rows);
        console.table(totals);
        break;
      }
      default:
        console.log(USAGE);
        process.exitCode = command ? 1 : 0;
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
