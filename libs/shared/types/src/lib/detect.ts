import { FRAMEWORKS, FRAMEWORK_IDS, Framework } from './frameworks';
import { minVersionFromRange, versionToNum } from './version';

export interface FrameworkMention {
  framework: Framework;
  /** Version as written in the question ("2", "18.2"), or null if none was given. */
  version: string | null;
  index: number;
  /** Index just past the mention (and its version). */
  end: number;
}

const VERSION_SUFFIX = '(?:\\s*(?:@|\\bv(?:ersion)?\\s*)?\\s*(\\d+(?:\\.\\d+){0,2})(?![\\d]))';

function aliasRegex(pattern: string, needsVersion: boolean, caseSensitive: boolean) {
  const suffix = needsVersion ? VERSION_SUFFIX : `${VERSION_SUFFIX}?`;
  return new RegExp(`(?<![\\w@/.-])(?:${pattern})(?![\\w])${suffix}`, caseSensitive ? 'g' : 'gi');
}

const ALIAS_REGEXES = FRAMEWORK_IDS.flatMap((framework) =>
  FRAMEWORKS[framework].aliases.map((alias) => ({
    framework,
    re: aliasRegex(alias.pattern, !!alias.needsVersion, !!alias.caseSensitive),
  })),
);

/** Finds every framework mentioned in a question, in order of appearance. */
export function detectFrameworks(question: string): FrameworkMention[] {
  const byIndex = new Map<number, FrameworkMention>();
  for (const { framework, re } of ALIAS_REGEXES) {
    re.lastIndex = 0;
    for (const match of question.matchAll(re)) {
      const existing = byIndex.get(match.index);
      const version = match[1] ?? null;
      // Several aliases can hit the same spot; keep the one that also captured a version.
      if (!existing || (!existing.version && version)) {
        byIndex.set(match.index, { framework, version, index: match.index, end: match.index + match[0].length });
      }
    }
  }
  return [...byIndex.values()].sort((a, b) => a.index - b.index);
}

export interface Comparison {
  framework: Framework;
  /** Older version, as written. */
  from: string;
  /** Newer version, as written. */
  to: string;
}

const V = String.raw`v?(\d+(?:\.\d+){0,2})(?![\d.])`;
const BETWEEN_RE = new RegExp(String.raw`\b(?:between|from)\s+${V}\s+(?:and|to)\s+${V}`, 'i');
const FOLLOWED_BY_RE = new RegExp(String.raw`^\s*(?:to|vs\.?|versus|and|->|→)\s*${V}`, 'i');

/**
 * Detects "what changed" questions about two versions of one framework:
 * "Vue 2 vs Vue 3", "Next.js routing between 12 and 14", "Angular 12 → 17".
 */
export function detectComparison(question: string): Comparison | null {
  const mentions = detectFrameworks(question);
  const framework = primaryMention(mentions)?.framework;
  if (!framework) return null;
  const versioned = mentions.filter((m) => m.framework === framework && m.version);

  let pair: [string, string] | null = null;
  const distinct = [...new Set(versioned.map((m) => m.version as string))];
  const between = BETWEEN_RE.exec(question);
  const followedBy = versioned[0] && FOLLOWED_BY_RE.exec(question.slice(versioned[0].end));
  if (distinct.length >= 2) pair = [distinct[0], distinct[1]];
  else if (between) pair = [between[1], between[2]];
  else if (followedBy && versioned[0].version) pair = [versioned[0].version, followedBy[1]];

  if (!pair || versionToNum(pair[0]) === versionToNum(pair[1])) return null;
  const [from, to] = pair.sort((a, b) => versionToNum(a) - versionToNum(b));
  return { framework, from, to };
}

const COMPARISON_PHRASES = [
  /\bwhat(?:'s| has| is)?\s+(?:changed|different|new)\b/gi,
  /\b(?:how|what)\s+(?:does|do|did)\b.*?\bdiffer\b/gi,
  /\b(?:differences?|changes?|changed|migrat\w*|upgrad\w*|compared?|comparison)\b/gi,
  /\b(?:between|from|vs\.?|versus|to|and|in|of|for)\b/gi,
  /->|→/g,
];

/**
 * The subject of a "what changed" question, for retrieval: "What changed in v-model between Vue 2
 * and 3?" -> "v-model". Comparison wording otherwise pulls in generic migration pages.
 */
export function comparisonTopic(question: string): string {
  let topic = question;
  for (const mention of detectFrameworks(question).reverse()) {
    topic = topic.slice(0, mention.index) + ' ' + topic.slice(mention.end);
  }
  topic = topic.replace(new RegExp(String.raw`\bv?\d+(?:\.\d+){0,2}\b`, 'g'), ' ');
  for (const phrase of COMPARISON_PHRASES) topic = topic.replace(phrase, ' ');
  topic = topic.replace(/[?!.,:;]+/g, ' ').replace(/\s+/g, ' ').trim();
  return topic.length >= 3 ? topic : question;
}

/**
 * The mention a question is mainly about. A framework given with a version wins; TypeScript is
 * often only the language ("run a TypeScript file in Node 22", "Vue 3 with TypeScript"), so any
 * other framework wins over it.
 */
export function primaryMention(mentions: FrameworkMention[]): FrameworkMention | null {
  return (
    mentions.find((m) => m.version) ?? mentions.find((m) => m.framework !== 'typescript') ?? mentions[0] ?? null
  );
}

export interface DetectedDependency {
  framework: Framework;
  version: string;
  /** Where it was found, e.g. "dependencies.vue" or "engines.node". */
  from: string;
}

type PackageJsonLike = Partial<
  Record<'dependencies' | 'devDependencies' | 'peerDependencies', Record<string, string>>
> & { engines?: Record<string, string> };

/** Reads a package.json and returns the framework versions it pins. */
export function detectFromPackageJson(pkg: PackageJsonLike): DetectedDependency[] {
  const found: DetectedDependency[] = [];
  const sections = ['dependencies', 'devDependencies', 'peerDependencies'] as const;
  for (const framework of FRAMEWORK_IDS) {
    let hit: DetectedDependency | null = null;
    for (const section of sections) {
      for (const name of FRAMEWORKS[framework].packages) {
        const range = pkg[section]?.[name];
        const version = range ? minVersionFromRange(range) : null;
        if (version && !hit) hit = { framework, version, from: `${section}.${name}` };
      }
    }
    if (hit) found.push(hit);
  }
  const nodeRange = pkg.engines?.['node'];
  const nodeVersion = nodeRange ? minVersionFromRange(nodeRange) : null;
  if (nodeVersion) found.push({ framework: 'node', version: nodeVersion, from: 'engines.node' });
  return found;
}
