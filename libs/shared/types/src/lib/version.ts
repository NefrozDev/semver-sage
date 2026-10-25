export interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
}

// One optional run of whitespace on each side of the prefix: adjacent `\s*[v=]?\s*` backtracks
// quadratically on long whitespace (and this parses request input).
const VERSION_RE = /^\s*(?:[v=]\s*)?(\d+)(?:\.(\d+|x|\*))?(?:\.(\d+|x|\*))?/i;

/** Parses "3", "v18.2", "2.7.14", "14.x" into numeric parts (missing parts are 0). */
export function parseVersion(input: string): ParsedVersion | null {
  const match = VERSION_RE.exec(input);
  if (!match) return null;
  const part = (s: string | undefined) => (s && /^\d+$/.test(s) ? Number(s) : 0);
  return { major: Number(match[1]), minor: part(match[2]), patch: part(match[3]) };
}

/**
 * Encodes a version as a sortable integer: major * 1e6 + minor * 1e3 + patch.
 * Stored in the DB so range filters (`first <= v <= last`) are plain integer compares.
 */
export function versionToNum(version: string | ParsedVersion): number {
  const v = typeof version === 'string' ? parseVersion(version) : version;
  if (!v) throw new Error(`Invalid version: ${String(version)}`);
  return v.major * 1_000_000 + Math.min(v.minor, 999) * 1_000 + Math.min(v.patch, 999);
}

export function numToVersion(num: number): string {
  const major = Math.floor(num / 1_000_000);
  const minor = Math.floor((num % 1_000_000) / 1_000);
  const patch = num % 1_000;
  if (patch) return `${major}.${minor}.${patch}`;
  if (minor) return `${major}.${minor}`;
  return String(major);
}

export function compareVersions(a: string, b: string): number {
  return versionToNum(a) - versionToNum(b);
}

/**
 * Turns an npm range ("^2.6.14", "~14.1.0", ">=18", "workspace:*") into the lowest
 * version it allows, or null when no concrete version can be derived.
 */
export function minVersionFromRange(range: string): string | null {
  const match = /(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(range);
  if (!match) return null;
  return [match[1], match[2], match[3]].filter((p) => p !== undefined).join('.');
}
