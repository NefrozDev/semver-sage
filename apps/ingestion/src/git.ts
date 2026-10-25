import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const git = (args: string[], cwd?: string) =>
  exec('git', ['-c', 'core.longpaths=true', ...args], { cwd, maxBuffer: 16 * 1024 * 1024 });

export interface ReleaseTag {
  tag: string;
  major: number;
  minor: number;
  patch: number;
}

/** Stable release tags ("v18.20.8" or "17.3.12"; no pre-releases) of a GitHub repo. */
export async function listReleaseTags(repo: string): Promise<ReleaseTag[]> {
  const { stdout } = await git(['ls-remote', '--tags', '--refs', `https://github.com/${repo}.git`]);
  return stdout
    .split('\n')
    .map((line) => line.split('refs/tags/')[1]?.trim())
    .map((tag) => ({ tag, match: tag && /^v?(\d+)\.(\d+)\.(\d+)$/.exec(tag) }))
    .filter((t): t is { tag: string; match: RegExpExecArray } => !!t.match)
    .map(({ tag, match }) => ({ tag, major: +match[1], minor: +match[2], patch: +match[3] }));
}

/** The newest release of each major version, ascending. */
export function latestPerMajor(tags: ReleaseTag[], filter: (t: ReleaseTag) => boolean = () => true): ReleaseTag[] {
  const latest = new Map<number, ReleaseTag>();
  for (const t of tags.filter(filter)) {
    const current = latest.get(t.major);
    if (!current || t.minor > current.minor || (t.minor === current.minor && t.patch > current.patch)) {
      latest.set(t.major, t);
    }
  }
  return [...latest.values()].sort((a, b) => a.major - b.major);
}

/**
 * Shallow, sparse checkout of `paths` at `ref`. Only the docs folders are materialized, which keeps
 * clones small and avoids Windows path-length failures on unrelated files.
 * Returns the checkout directory and the commit it points at.
 */
export async function checkoutDocs(
  cacheDir: string,
  repo: string,
  ref: string,
  paths: string[],
): Promise<{ dir: string; commit: string }> {
  const dir = join(cacheDir, `${repo.replace('/', '__')}@${ref}`);
  if (existsSync(join(dir, '.git'))) {
    await git(['fetch', '--depth', '1', 'origin', ref], dir);
    await git(['checkout', '--force', 'FETCH_HEAD'], dir);
  } else {
    await git([
      'clone',
      '--depth', '1',
      '--filter=blob:none',
      '--sparse',
      '--branch', ref,
      `https://github.com/${repo}.git`,
      dir,
    ]);
  }
  await git(['sparse-checkout', 'set', ...paths], dir);
  const { stdout } = await git(['rev-parse', 'HEAD'], dir);
  return { dir, commit: stdout.trim() };
}
