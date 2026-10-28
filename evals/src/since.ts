import { createPool, Embedder, getConfig, resolveScope, Retriever } from '@semver-sage/server-core';
import { FRAMEWORKS, isFramework, isSinceWhenQuestion, sinceTopics } from '@semver-sage/types';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { scoreSince, SinceItem, SinceScore, SinceSummary, summarizeSince } from './metrics';

/**
 * "Since when?" evals: does the history search name the oldest indexed version whose docs cover the
 * subject? Expected versions are what the indexed docs show (a backport documented in an older major
 * counts), not release notes. Run: npm run eval:since [-- --frameworks node,react --assert]
 */

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

interface Row {
  item: SinceItem;
  score: SinceScore;
  earliest: string | null;
}

async function loadItems(dir: string, frameworks: string[]): Promise<SinceItem[]> {
  const files = (await readdir(dir)).filter((f) => f.endsWith('.json')).sort((a, b) => a.localeCompare(b));
  const items = (
    await Promise.all(files.map(async (f) => JSON.parse(await readFile(join(dir, f), 'utf8')) as SinceItem[]))
  ).flat();
  return items.filter((i) => frameworks.includes(i.framework));
}

async function main() {
  const { values } = parseArgs({
    options: {
      frameworks: { type: 'string' },
      out: { type: 'string', default: 'evals/results' },
      assert: { type: 'boolean', default: false },
    },
  });
  const config = getConfig();
  const pool = createPool(config.databaseUrl);
  const retriever = new Retriever(pool, new Embedder(config.embeddingModel, config.modelCacheDir));

  try {
    const indexed = await retriever.indexedVersions();
    const indexedFrameworks = [...new Set(indexed.map((v) => v.framework))];
    const wanted = values.frameworks?.split(',').map((f) => f.trim()).filter(isFramework) ?? indexedFrameworks;
    const missing = wanted.filter((f) => !indexedFrameworks.includes(f));
    if (missing.length) throw new Error(`Not indexed: ${missing.join(', ')}. Ingest them first.`);
    const items = await loadItems(resolve('evals/golden-since'), wanted);
    console.log(`${items.length} "since when?" questions over ${wanted.join(', ')}`);

    const rows: Row[] = [];
    for (const item of items) {
      const scope = resolveScope({ question: item.question, framework: item.framework }, indexed);
      const result = await retriever.searchHistory(item.question, sinceTopics(item.question), scope);
      const earliest = result?.earliest ?? null;
      const score = scoreSince(
        item,
        isSinceWhenQuestion(item.question),
        earliest,
        (result?.citations ?? []).map((c) => c.version),
      );
      rows.push({ item, score, earliest });
      console.log(`${score.correct ? 'ok  ' : 'MISS'} ${item.id}: ${earliest} (expected ${item.earliest})`);
    }

    const overall = summarizeSince(rows.map((r) => r.score));
    const byFramework = Object.fromEntries(
      wanted.map((f) => [f, summarizeSince(rows.filter((r) => r.item.framework === f).map((r) => r.score))]),
    );
    const bySet = (set: SinceItem['set']) => summarizeSince(rows.filter((r) => r.item.set === set).map((r) => r.score));
    const report = renderReport(rows, overall, byFramework, bySet('tuning'), bySet('holdout'));
    await mkdir(resolve(values.out), { recursive: true });
    await writeFile(join(resolve(values.out), 'since.md'), report);
    console.log(`\nAccuracy ${pct(overall.accuracy)} (holdout ${pct(bySet('holdout').accuracy)}). Report: ${join(values.out, 'since.md')}`);

    if (values.assert) assertBaseline(byFramework);
  } finally {
    await pool.end();
  }
}

function renderReport(
  rows: Row[],
  overall: SinceSummary,
  byFramework: Record<string, SinceSummary>,
  tuning: SinceSummary,
  holdout: SinceSummary,
): string {
  const line = (name: string, s: SinceSummary) =>
    `| ${name} | ${s.count} | ${pct(s.accuracy)} | ${pct(s.cited)} | ${pct(s.detection)} |`;
  const misses = rows
    .filter((r) => !r.score.correct || !r.score.detected)
    .map((r) => `- \`${r.item.id}\`: "${r.item.question}" -> ${r.earliest ?? 'nothing'} (expected ${r.item.earliest})` +
      (r.score.detected ? '' : ', not detected as a "since when?" question'));
  return [
    `# "Since when?" evals`,
    ``,
    `Does the history search name the oldest indexed version whose docs cover the subject? Expected`,
    `versions are what the indexed docs show, so a feature backported to an older major counts there.`,
    `"Tuning" questions calibrated the search; "holdout" questions were only run afterwards.`,
    ``,
    `| Set | Questions | Earliest version right | Expected version cited | Detected |`,
    `| --- | --- | --- | --- | --- |`,
    line('All', overall),
    line('Tuning', tuning),
    line('Holdout', holdout),
    ...Object.entries(byFramework).map(([f, s]) => line(FRAMEWORKS[f as keyof typeof FRAMEWORKS].label, s)),
    ``,
    `## Misses`,
    ``,
    misses.length ? misses.join('\n') : '_None._',
    ``,
  ].join('\n');
}

function assertBaseline(byFramework: Record<string, SinceSummary>) {
  const path = resolve('evals/baseline.json');
  const baseline = existsSync(path)
    ? (JSON.parse(readFileSync(path, 'utf8')) as { tolerance: number; since?: Record<string, number> })
    : null;
  if (!baseline?.since) {
    console.warn('No "since" entry in evals/baseline.json: skipping assertion');
    return;
  }
  const failures = Object.entries(baseline.since)
    .filter(([f, expected]) => byFramework[f] && byFramework[f].accuracy < expected - baseline.tolerance)
    .map(([f, expected]) => `${f}: ${byFramework[f].accuracy.toFixed(3)} < baseline ${expected.toFixed(3)}`);
  if (failures.length) {
    console.error(`"Since when?" accuracy regressed:\n${failures.join('\n')}`);
    process.exitCode = 1;
  } else {
    console.log('"Since when?" accuracy is at or above baseline');
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
