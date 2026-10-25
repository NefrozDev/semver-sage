import { createPool, Retriever, type SearchScope } from '@semver-sage/server-core';
import { versionToNum } from '@semver-sage/types';
import type { Pool } from 'pg';
import { finishRebuild, ingestVersion, startRebuild } from './ingest';
import { fakeAdapter, fakeCheckout, FakeEmbedder, page, versionSource } from './testing/fakes';
import { TEST_DATABASE_URL } from './testing/global-setup';

// Three versions of a tiny "framework":
//   v1: install + filters (old text)
//   v2: install unchanged, filters rewritten, composables added
//   v3: install removed, filters back to the v1 text, composables unchanged
const INSTALL = 'Install the package with npm install and import it in your main entry file.';
const FILTERS_V1 = 'Register a global filter with Vue.filter and use it in mustache interpolations.';
const FILTERS_V2 = 'Filters were removed; use computed properties or methods to format values instead.';
const COMPOSABLES = 'Extract reusable stateful logic into composables built on ref and computed functions.';

const pages = {
  '1': [page('guide/install', 'Installation', { '': INSTALL }), page('guide/filters', 'Filters', { Usage: FILTERS_V1 })],
  '2': [
    page('guide/install', 'Installation', { '': INSTALL }),
    page('guide/filters', 'Filters', { Usage: FILTERS_V2 }),
    page('guide/composables', 'Composables', { '': COMPOSABLES }),
  ],
  '3': [
    page('guide/filters', 'Filters', { Usage: FILTERS_V1 }),
    page('guide/composables', 'Composables', { '': COMPOSABLES }),
  ],
};

interface Row {
  url_path: string;
  content: string;
  first: string;
  last: string;
}

let pool: Pool;
let embedder: FakeEmbedder;
const adapter = fakeAdapter(pages);
const ingest = (version: keyof typeof pages) =>
  ingestVersion(pool, embedder, adapter, versionSource(version), {
    repoCacheDir: '/unused',
    checkout: fakeCheckout,
    log: () => undefined,
  });

/** Stored rows with their version range as labels, in a stable order. */
async function rows(): Promise<Row[]> {
  const { rows } = await pool.query<Row>(`
    SELECT c.url_path, c.content, fv.version AS first, lv.version AS last
      FROM chunks c
      JOIN doc_versions fv ON fv.framework = c.framework AND fv.version_num = c.first_version_num
      JOIN doc_versions lv ON lv.framework = c.framework AND lv.version_num = c.last_version_num
     ORDER BY c.url_path, c.first_version_num`);
  return rows;
}

const range = (all: Row[], content: string) =>
  all.filter((r) => r.content === content).map((r) => `${r.first}-${r.last}`);

beforeAll(() => {
  pool = createPool(TEST_DATABASE_URL);
});

afterAll(() => pool.end());

beforeEach(async () => {
  embedder = new FakeEmbedder();
  await pool.query('TRUNCATE chunks, doc_versions, embedding_reuse');
});

describe('ingesting versions in order', () => {
  it('stores the first version as new rows', async () => {
    const stats = await ingest('1');
    expect(stats).toMatchObject({ pages: 2, chunks: 2, extended: 0, inserted: 2, embedded: 2 });
    expect(await rows()).toEqual([
      { url_path: 'guide/filters', content: FILTERS_V1, first: '1', last: '1' },
      { url_path: 'guide/install', content: INSTALL, first: '1', last: '1' },
    ]);
  });

  it('extends unchanged chunks and only embeds new text', async () => {
    await ingest('1');
    const stats = await ingest('2');

    expect(stats).toMatchObject({ chunks: 3, extended: 1, inserted: 2, embedded: 2 });
    const all = await rows();
    expect(range(all, INSTALL)).toEqual(['1-2']); // unchanged: one row spanning both versions
    expect(range(all, FILTERS_V1)).toEqual(['1-1']); // changed: the old text stops at v1
    expect(range(all, FILTERS_V2)).toEqual(['2-2']);
    expect(range(all, COMPOSABLES)).toEqual(['2-2']);
    expect(embedder.embedded).toHaveLength(4);
  });

  it('gives text that comes back after a gap a new row, reusing its embedding', async () => {
    await ingest('1');
    await ingest('2');
    const stats = await ingest('3');

    const all = await rows();
    expect(range(all, FILTERS_V1)).toEqual(['1-1', '3-3']); // not 1-3: it was absent from v2
    expect(range(all, INSTALL)).toEqual(['1-2']); // removed in v3
    expect(range(all, COMPOSABLES)).toEqual(['2-3']);
    expect(stats).toMatchObject({ extended: 1, inserted: 1, embedded: 0 });
  });

  it('skips a version that is already ingested', async () => {
    await ingest('1');
    expect(await ingest('1')).toBeNull();
    expect(await rows()).toHaveLength(2);
  });

  it('refuses an older version than the newest indexed one, pointing at rebuild', async () => {
    await ingest('2');
    await expect(ingest('1')).rejects.toThrow(/ascending order.*rebuild vue/);
  });

  it('records each version with its docs URL and commit', async () => {
    await ingest('1');
    const { rows: versions } = await pool.query(
      'SELECT version, docs_base_url, source_commit, chunk_count FROM doc_versions',
    );
    expect(versions).toEqual([
      { version: '1', docs_base_url: 'https://docs.test/v1/', source_commit: 'commit-1', chunk_count: 2 },
    ]);
  });
});

describe('rebuilding', () => {
  it('re-ingests every version in order without embedding anything again', async () => {
    await ingest('1');
    await ingest('2');
    await ingest('3');
    const before = await rows();

    embedder = new FakeEmbedder();
    expect(before).toHaveLength(5);
    expect(await startRebuild(pool, 'vue')).toBe(4); // one per distinct text (FILTERS_V1 has two rows)
    expect(await rows()).toEqual([]);
    for (const version of ['1', '2', '3'] as const) await ingest(version);
    await finishRebuild(pool, 'vue');

    expect(await rows()).toEqual(before);
    expect(embedder.embedded).toEqual([]);
    expect((await pool.query('SELECT count(*)::int AS n FROM embedding_reuse')).rows[0].n).toBe(0);
  });
});

describe('searching a version', () => {
  const scope = (version: string): SearchScope => ({
    framework: 'vue',
    requestedVersion: version,
    version,
    versionNum: versionToNum(version),
    source: 'question',
  });

  beforeEach(async () => {
    await ingest('1');
    await ingest('2');
    await ingest('3');
  });

  it('only returns text that exists in the asked version', async () => {
    const retriever = new Retriever(pool, embedder);
    const contents = async (version: string) =>
      (await retriever.search('filters', scope(version), { topK: 10 })).map((c) => c.snippet);

    expect(await contents('1')).toEqual(expect.arrayContaining([FILTERS_V1, INSTALL]));
    expect(await contents('1')).toHaveLength(2);
    expect(await contents('2')).not.toContain(FILTERS_V1);
    expect(await contents('2')).toContain(FILTERS_V2);
    expect(await contents('3')).not.toContain(INSTALL);
  });

  it('ranks by similarity and cites the asked version with the text’s version range', async () => {
    const retriever = new Retriever(pool, embedder);
    const [best] = await retriever.search('reusable stateful logic composables', scope('3'));

    expect(best).toMatchObject({
      n: 1,
      framework: 'vue',
      version: '3',
      firstVersion: '2',
      lastVersion: '3',
      url: 'https://docs.test/v3/guide/composables',
      pageTitle: 'Composables',
    });
  });

  it('builds citation URLs from the asked version, even for a row spanning versions', async () => {
    const retriever = new Retriever(pool, embedder);
    const [install] = await retriever.search('install the package with npm', scope('2'));
    expect(install).toMatchObject({ url: 'https://docs.test/v2/guide/install', firstVersion: '1', lastVersion: '2' });
  });

  it('returns nothing for an unindexed version of a known framework', async () => {
    const retriever = new Retriever(pool, embedder);
    const none = { ...scope('9'), version: null, versionNum: null };
    expect(await retriever.search('filters', none)).toEqual([]);
  });
});
