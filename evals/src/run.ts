import {
  buildMessages,
  createLlmProvider,
  createPool,
  Embedder,
  getConfig,
  Reranker,
  resolveScope,
  RetrieveOptions,
  Retriever,
} from '@semver-sage/server-core';
import { FRAMEWORKS, isFramework } from '@semver-sage/types';
import type { Pool } from 'pg';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { citationStats, GoldenItem, ItemScore, scoreItem, Summary, summarize } from './metrics';
import { judgeFaithfulness } from './judge';

const CONFIGS: { name: string; options: RetrieveOptions }[] = [
  { name: 'Vector only, no version filter', options: { keyword: false, rerank: false, versionFilter: false } },
  { name: '+ full-text (hybrid, RRF)', options: { rerank: false, versionFilter: false } },
  { name: '+ rerank', options: { versionFilter: false } },
  { name: 'Hybrid + version filter (no rerank)', options: { rerank: false } },
  { name: 'Full: hybrid + rerank + version filter', options: {} },
];
const FULL = CONFIGS[CONFIGS.length - 1];
const EVAL_TOP_K = 10;

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

interface ConfigResult {
  name: string;
  summary: Summary;
  byFramework: Record<string, Summary>;
  avgMs: number;
  scores: ItemScore[];
}

async function loadGolden(dir: string, frameworks: string[] | null): Promise<GoldenItem[]> {
  const files = (await readdir(dir)).filter((f) => f.endsWith('.json')).sort();
  const items = (
    await Promise.all(files.map(async (f) => JSON.parse(await readFile(join(dir, f), 'utf8')) as GoldenItem[]))
  ).flat();
  return frameworks ? items.filter((i) => frameworks.includes(i.framework)) : items;
}

async function main() {
  const { values } = parseArgs({
    options: {
      frameworks: { type: 'string' },
      configs: { type: 'string', default: 'ablation' },
      out: { type: 'string', default: 'evals/results' },
      assert: { type: 'boolean', default: false },
      answers: { type: 'string' },
      judge: { type: 'boolean', default: false },
      check: { type: 'boolean', default: false },
    },
  });
  const config = getConfig();
  const pool = createPool(config.databaseUrl);
  const retriever = new Retriever(
    pool,
    new Embedder(config.embeddingModel, config.modelCacheDir),
    new Reranker(config.rerankerModel, config.modelCacheDir),
  );

  try {
    const indexed = await retriever.indexedVersions();
    const indexedFrameworks = [...new Set(indexed.map((v) => v.framework))];
    const wanted = values.frameworks?.split(',').map((f) => f.trim()).filter(isFramework) ?? indexedFrameworks;
    const golden = await loadGolden(resolve('evals/golden'), wanted);
    const missing = wanted.filter((f) => !indexedFrameworks.includes(f));
    if (missing.length) throw new Error(`Not indexed: ${missing.join(', ')}. Ingest them first.`);
    console.log(`${golden.length} questions over ${wanted.join(', ')}`);
    if (values.check) {
      await checkGolden(pool, golden);
      return;
    }

    const configs = values.configs === 'full' ? [FULL] : CONFIGS;
    const results: ConfigResult[] = [];
    const retrievedFull = new Map<string, Awaited<ReturnType<Retriever['search']>>>();

    for (const { name, options } of configs) {
      const scores: ItemScore[] = [];
      const started = Date.now();
      for (const item of golden) {
        const scope = resolveScope({ question: item.question, ...item.request }, indexed);
        const citations = await retriever.search(item.question, scope, { ...options, topK: EVAL_TOP_K });
        if (name === FULL.name) retrievedFull.set(item.id, citations);
        scores.push(scoreItem(item, citations));
      }
      const byFramework = Object.fromEntries(
        wanted.map((f) => [f, summarize(scores.filter((_, i) => golden[i].framework === f))]),
      );
      results.push({ name, summary: summarize(scores), byFramework, avgMs: (Date.now() - started) / golden.length, scores });
      console.log(`${name}: hit@5 ${pct(results.at(-1)!.summary.hit5)}, MRR ${results.at(-1)!.summary.reciprocalRank.toFixed(3)}`);
    }

    const full = results.find((r) => r.name === FULL.name)!;
    const misses = golden
      .map((item, i) => ({ item, score: full.scores[i] }))
      .filter(({ score }) => !score.hit5)
      .map(({ item }) => {
        const got = (retrievedFull.get(item.id) ?? []).slice(0, 3).map((c) => `${c.framework}@${c.version} ${c.url}`);
        return `- \`${item.id}\`: "${item.question}"\n${got.map((g) => `  - got ${g}`).join('\n')}`;
      });

    let answersSection = '';
    if (values.answers) {
      answersSection = await evaluateAnswers(
        golden.slice(0, Number(values.answers) || golden.length),
        indexed,
        retriever,
        values.judge,
      );
    }

    const report = renderReport(results, wanted, golden.length, misses, answersSection);
    await mkdir(resolve(values.out), { recursive: true });
    await writeFile(join(resolve(values.out), 'latest.md'), report);
    await writeFile(
      join(resolve(values.out), 'latest.json'),
      JSON.stringify(results.map(({ scores, ...r }) => r), null, 2),
    );
    console.log(`\nReport written to ${join(values.out, 'latest.md')}`);

    if (values.assert) assertBaseline(full);
  } finally {
    await pool.end();
  }
}

function renderReport(results: ConfigResult[], frameworks: string[], count: number, misses: string[], extra: string) {
  const row = (r: ConfigResult) =>
    `| ${r.name} | ${pct(r.summary.hit1)} | ${pct(r.summary.hit5)} | ${pct(r.summary.recall5)} | ` +
    `${r.summary.reciprocalRank.toFixed(3)} | ${pct(r.summary.versionPrecision5)} | ${Math.round(r.avgMs)} ms |`;
  const full = results.at(-1)!;
  const perFramework = frameworks
    .map((f) => {
      const s = full.byFramework[f];
      return `| ${FRAMEWORKS[f as keyof typeof FRAMEWORKS].label} | ${s.count} | ${pct(s.hit1)} | ${pct(s.hit5)} | ${s.reciprocalRank.toFixed(3)} | ${pct(s.versionPrecision5)} |`;
    })
    .join('\n');

  return [
    `# Retrieval evals`,
    ``,
    `${count} golden questions (${frameworks.join(', ')}). A result is relevant only if it comes from the`,
    `asked framework **and version** and matches an expected docs page or anchor.`,
    ``,
    `| Pipeline | Hit@1 | Hit@5 | Recall@5 | MRR | Version precision@5 | Latency |`,
    `| --- | --- | --- | --- | --- | --- | --- |`,
    ...results.map(row),
    ``,
    `## Full pipeline by framework`,
    ``,
    `| Framework | Questions | Hit@1 | Hit@5 | MRR | Version precision@5 |`,
    `| --- | --- | --- | --- | --- | --- |`,
    perFramework,
    ``,
    `## Misses (full pipeline, nothing relevant in the top 5)`,
    ``,
    misses.length ? misses.join('\n') : '_None._',
    extra,
    ``,
  ].join('\n');
}

async function evaluateAnswers(
  items: GoldenItem[],
  indexed: Awaited<ReturnType<Retriever['indexedVersions']>>,
  retriever: Retriever,
  judge: boolean,
): Promise<string> {
  const llm = createLlmProvider(getConfig());
  const signal = new AbortController().signal;
  const rows: string[] = [];
  let cited = 0;
  let invalid = 0;
  const faithfulness: number[] = [];

  for (const item of items) {
    const scope = resolveScope({ question: item.question, ...item.request }, indexed);
    const citations = await retriever.search(item.question, scope);
    let answer = '';
    for await (const text of llm.stream(buildMessages(item.question, scope, citations), signal)) answer += text;
    const stats = citationStats(answer, citations.length);
    cited += stats.cites ? 1 : 0;
    invalid += stats.invalid;
    const score = judge ? await judgeFaithfulness(llm, citations, item.question, answer) : null;
    if (score !== null) faithfulness.push(score);
    rows.push(`| \`${item.id}\` | ${stats.cites ? 'yes' : 'no'} | ${stats.invalid} | ${score === null ? '-' : score.toFixed(2)} |`);
    console.log(`answer ${item.id}: cites=${stats.cites} invalid=${stats.invalid} faithfulness=${score ?? '-'}`);
  }

  const avg = faithfulness.length ? faithfulness.reduce((a, b) => a + b, 0) / faithfulness.length : null;
  return [
    ``,
    `## Answers (${llm.name})`,
    ``,
    `Cited at least one source: ${pct(cited / items.length)} · dangling [n] markers: ${invalid}` +
      (avg === null ? '' : ` · mean faithfulness (LLM judge): ${avg.toFixed(2)}`),
    ``,
    `| Question | Cites | Dangling refs | Faithfulness |`,
    `| --- | --- | --- | --- |`,
    ...rows,
  ].join('\n');
}

/** Verifies every expected fragment exists in the indexed docs of the item's version. */
async function checkGolden(pool: Pool, golden: GoldenItem[]) {
  const problems: string[] = [];
  for (const item of golden) {
    for (const fragment of item.expect) {
      const { rows } = await pool.query(
        `SELECT 1 FROM chunks c
           JOIN doc_versions v ON v.framework = c.framework AND v.version = $2
          WHERE c.framework = $1 AND c.first_version_num <= v.version_num AND c.last_version_num >= v.version_num
            AND (c.url_path || coalesce('#' || c.anchor, '')) LIKE '%' || $3 || '%'
          LIMIT 1`,
        [item.framework, item.version, fragment],
      );
      if (!rows.length) problems.push(`${item.id}: "${fragment}" not found in ${item.framework}@${item.version}`);
    }
  }
  console.log(problems.length ? problems.join('\n') : 'All expected pages exist in the index');
  if (problems.length) process.exitCode = 1;
}

/** Fails the run if the full pipeline drops below the committed baseline (minus a small tolerance). */
function assertBaseline(full: ConfigResult) {
  const path = resolve('evals/baseline.json');
  if (!existsSync(path)) {
    console.warn('No evals/baseline.json: skipping assertion');
    return;
  }
  const baseline = JSON.parse(readFileSync(path, 'utf8')) as {
    tolerance: number;
    frameworks: Record<string, { hit5: number; reciprocalRank: number }>;
  };
  const failures: string[] = [];
  for (const [framework, expected] of Object.entries(baseline.frameworks)) {
    const actual = full.byFramework[framework];
    if (!actual) continue;
    for (const metric of ['hit5', 'reciprocalRank'] as const) {
      if (actual[metric] < expected[metric] - baseline.tolerance) {
        failures.push(`${framework} ${metric}: ${actual[metric].toFixed(3)} < baseline ${expected[metric].toFixed(3)}`);
      }
    }
  }
  if (failures.length) {
    console.error(`Retrieval regressed:\n${failures.join('\n')}`);
    process.exitCode = 1;
  } else {
    console.log('Retrieval is at or above baseline');
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
