/**
 * "Since when?" questions: find the oldest indexed version whose docs cover a subject.
 *
 * Similarity alone can't decide it: old pages that merely look alike (React 0.13's add-ons page for
 * "portals") score close to the real thing. So a hit only counts as evidence when it is close to the
 * best hit AND mentions the subject literally ("portal", "useId", "app router").
 */

export interface HistoryHit {
  id: string;
  /** Cosine similarity to the question (1 = identical). */
  sim: number;
  firstVersionNum: number;
  lastVersionNum: number;
  urlPath: string;
  sourcePath: string;
  pageTitle: string;
  section: string;
  anchor: string | null;
  content: string;
}

/** How far below the best hit a hit may score and still count. Calibrated on evals/golden-since. */
export const SIMILARITY_MARGIN = 0.07;
/** Sources given to the LLM: the oldest evidence first, then the closest hits. */
export const HISTORY_TOP_K = 6;
const OLDEST_SOURCES = 2;

/** Too generic to require literally: "built-in fetch" must match "fetch", not "built-in". */
const GENERIC_WORDS = new Set(
  [
    'built-in builtin native new feature features api apis function functions method methods option options',
    'flag flags module modules keyword operator block directive directives syntax type types component',
    'components decorator decorators property properties class classes support way ability',
  ]
    .join(' ')
    .split(' '),
);
const MAX_SUBJECT_WORDS = 4;

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
/** camelCase, snake_case, dotted, @-prefixed...: matched exactly, not stemmed. */
const isIdentifier = (word: string) => /[^a-z-]/i.test(word) || /[a-z][A-Z]/.test(word);

const WORD_START = String.raw`(?<![\w$])`;
const WORD_END = String.raw`(?![\w$])`;
const WORD_SEPARATOR = String.raw`[\s_-]{1,3}`;
const escapeLike = (text: string) => text.replace(/[\\%_]/g, String.raw`\$&`);

const SNAKE_OR_KEBAB = /^[a-z]+(?:[_-][a-z]+)+$/i;

function wordPattern(word: string): string {
  const bare = word.replace(/\(\)$/, '');
  // "worker_threads" is titled "Worker threads".
  if (SNAKE_OR_KEBAB.test(bare)) return bare.split(/[_-]/).map(escapeRegExp).join(WORD_SEPARATOR) + WORD_END;
  if (isIdentifier(bare)) return escapeRegExp(bare) + WORD_END;
  // Light stemming: "interceptors" matches "interceptor", "signals" matches "signaling".
  return escapeRegExp(stem(bare)) + String.raw`\w{0,3}` + WORD_END;
}

const stem = (word: string) => (word.length > 3 && /[^s]s$/i.test(word) ? word.slice(0, -1) : word);

/**
 * The subject as a phrase to find in a chunk: "app router" must appear as such (Next.js 9 docs
 * mention "app" and "router" separately). Null when only generic words are left.
 */
export function subjectPattern(topic: string): RegExp | null {
  const words = subjectWords(topic);
  if (!words.length) return null;
  return new RegExp(WORD_START + words.map(wordPattern).join(WORD_SEPARATOR), 'i');
}

const subjectWords = (topic: string) =>
  topic
    .split(/\s+/)
    .map((w) => w.replace(/["'`]/g, '').replace(/\(\)$/, ''))
    .filter((w) => w && !GENERIC_WORDS.has(w.toLowerCase()))
    .slice(0, MAX_SUBJECT_WORDS);

/** The words of a subject, for a cheap SQL prefilter (`ILIKE ALL`) before `subjectPattern`. */
export function subjectLikePatterns(topic: string): string[] {
  return subjectWords(topic)
    .flatMap((w) => w.split(/[_-]/))
    .map((w) => (isIdentifier(w) ? w : stem(w)))
    .filter(Boolean)
    .map((w) => `%${escapeLike(w)}%`);
}

/**
 * True when every word of the subject is an API name ("getServerSideProps", "fs.promises"): such a
 * name in a title is evidence anywhere in the docs, even on pages unlike today's (Next.js 9 documents
 * getServerSideProps on its data fetching page).
 */
export function isApiName(topic: string): boolean {
  const words = subjectWords(topic);
  // Not snake_case: "worker_threads" also matches "worker threads" in prose (Node 4's addons page).
  return words.length > 0 && words.every((w) => isIdentifier(w) && !SNAKE_OR_KEBAB.test(w));
}

/**
 * How a hit refers to the subject. A page or section about it ("fetch", "Portals") is stronger than
 * a passing mention: Angular 10's roadmap mentions standalone components four majors early.
 */
export type EvidenceLevel = 'title' | 'text' | 'similar';

type Mentionable = Pick<HistoryHit, 'pageTitle' | 'section' | 'content'>;

export function isEvidence(hit: Mentionable, subject: RegExp | null, level: EvidenceLevel): boolean {
  if (level === 'similar' || !subject) return true;
  const titles = `${hit.pageTitle}\n${hit.section}`;
  return subject.test(level === 'title' ? titles : `${titles}\n${hit.content}`);
}

/**
 * Hits that are evidence for the subject: close to the best hit and, when the subject has a
 * specific word, naming it in a title, or else in the text. Falls back to the closest hits.
 */
export function relevantHits(
  candidates: HistoryHit[],
  subject: RegExp | null,
): { hits: HistoryHit[]; level: EvidenceLevel } {
  if (!candidates.length) return { hits: [], level: 'similar' };
  const best = Math.max(...candidates.map((c) => c.sim));
  const close = candidates.filter((c) => c.sim >= best - SIMILARITY_MARGIN).sort((a, b) => b.sim - a.sim);
  for (const level of ['title', 'text'] as const) {
    const hits = subject ? close.filter((c) => isEvidence(c, subject, level)) : [];
    if (hits.length) return { hits, level };
  }
  return { hits: close.slice(0, HISTORY_TOP_K), level: 'similar' };
}

export interface HistorySelection {
  /** Oldest version (as a number) with evidence, or null when nothing was found. */
  earliestNum: number | null;
  /** Hits to cite, each with the version to cite it at, oldest first. */
  picks: { hit: HistoryHit; citeNum: number }[];
}

/**
 * Picks the sources for the answer: the oldest evidence (cited at the version it first appears in),
 * then the closest hits (cited at their newest version up to `upToNum`), in version order.
 * `older` are hits on the same pages found by the literal search, older than any vector hit.
 */
export function selectHistory(relevant: HistoryHit[], older: HistoryHit[], upToNum: number): HistorySelection {
  const evidence = dedupe([...older, ...relevant]);
  if (!evidence.length) return { earliestNum: null, picks: [] };
  const byAge = [...evidence].sort((a, b) => a.firstVersionNum - b.firstVersionNum || b.sim - a.sim);
  const picks: HistorySelection['picks'] = [];
  // A long section is split into several chunks: cite each version's section once.
  const cited = new Set<string>();
  const take = (hits: HistoryHit[], count: number, citeAt: (hit: HistoryHit) => number) => {
    let taken = 0;
    for (const hit of hits) {
      if (taken === count) break;
      const citeNum = citeAt(hit);
      const key = `${citeNum}\n${hit.urlPath}\n${hit.section}`;
      if (cited.has(key) || picks.some((p) => p.hit === hit)) continue;
      cited.add(key);
      picks.push({ hit, citeNum });
      taken++;
    }
  };
  take(byAge, OLDEST_SOURCES, (hit) => hit.firstVersionNum);
  const bySimilarity = [...evidence].sort((a, b) => b.sim - a.sim);
  take(bySimilarity, HISTORY_TOP_K - picks.length, (hit) => Math.min(hit.lastVersionNum, upToNum));
  picks.sort((a, b) => a.citeNum - b.citeNum);
  return { earliestNum: byAge[0].firstVersionNum, picks };
}

function dedupe(hits: HistoryHit[]): HistoryHit[] {
  const seen = new Set<string>();
  return hits.filter((h) => !seen.has(h.id) && seen.add(h.id));
}
