import { FRAMEWORKS, FRAMEWORK_IDS, Framework } from './frameworks';
import { minVersionFromRange } from './version';

export interface FrameworkMention {
  framework: Framework;
  /** Version as written in the question ("2", "18.2"), or null if none was given. */
  version: string | null;
  index: number;
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
        byIndex.set(match.index, { framework, version, index: match.index });
      }
    }
  }
  return [...byIndex.values()].sort((a, b) => a.index - b.index);
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
