import type { AskRequest, Framework } from '@semver-sage/types';

export interface GoldenItem {
  id: string;
  question: string;
  /** Explicit scope, as the UI pickers or a package.json would send it. */
  request?: Pick<AskRequest, 'framework' | 'version'>;
  /** The indexed docs version the answer must come from. */
  framework: Framework;
  version: string;
  /** URL fragments of relevant docs (page path, optionally with #anchor). */
  expect: string[];
  tags?: string[];
}

export interface Retrieved {
  framework: Framework;
  version: string;
  url: string;
}

export interface ItemScore {
  id: string;
  hit1: number;
  hit5: number;
  recall5: number;
  reciprocalRank: number;
  versionPrecision5: number;
  firstRelevantRank: number | null;
}

export type Summary = Omit<ItemScore, 'id' | 'firstRelevantRank'> & { count: number };

const sameVersion = (item: GoldenItem, r: Retrieved) =>
  r.framework === item.framework && r.version === item.version;

/** Relevant = right framework and version, and the URL matches an expected page/anchor. */
export function isRelevant(item: GoldenItem, r: Retrieved): boolean {
  return sameVersion(item, r) && item.expect.some((fragment) => r.url.includes(fragment));
}

export function scoreItem(item: GoldenItem, results: Retrieved[]): ItemScore {
  const top5 = results.slice(0, 5);
  const rank = results.findIndex((r) => isRelevant(item, r));
  const found = item.expect.filter((fragment) =>
    top5.some((r) => sameVersion(item, r) && r.url.includes(fragment)),
  );
  return {
    id: item.id,
    hit1: rank === 0 ? 1 : 0,
    hit5: rank >= 0 && rank < 5 ? 1 : 0,
    recall5: found.length / item.expect.length,
    reciprocalRank: rank >= 0 ? 1 / (rank + 1) : 0,
    versionPrecision5: top5.length ? top5.filter((r) => sameVersion(item, r)).length / top5.length : 0,
    firstRelevantRank: rank >= 0 ? rank + 1 : null,
  };
}

export function summarize(scores: ItemScore[]): Summary {
  const mean = (key: keyof Summary & keyof ItemScore) =>
    scores.length ? scores.reduce((sum, s) => sum + (s[key] as number), 0) / scores.length : 0;
  return {
    count: scores.length,
    hit1: mean('hit1'),
    hit5: mean('hit5'),
    recall5: mean('recall5'),
    reciprocalRank: mean('reciprocalRank'),
    versionPrecision5: mean('versionPrecision5'),
  };
}

/** Citation markers like [2] in an answer, and how many point at a source that doesn't exist. */
export function citationStats(answer: string, sourceCount: number) {
  const refs = [...answer.matchAll(/\[(\d{1,2})\]/g)].map((m) => Number(m[1]));
  return {
    cites: refs.some((n) => n >= 1 && n <= sourceCount),
    invalid: refs.filter((n) => n < 1 || n > sourceCount).length,
  };
}
