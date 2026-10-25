import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const git = (args: string[], cwd?: string) =>
  exec('git', ['-c', 'core.longpaths=true', ...args], { cwd, maxBuffer: 64 * 1024 * 1024 });
const remote = (repo: string) => `https://github.com/${repo}.git`;

/** Runs a git command in `dir` and returns trimmed stdout. */
export async function gitIn(dir: string, args: string[]): Promise<string> {
  return (await git(args, dir)).stdout.trim();
}

export interface ReleaseTag {
  tag: string;
  major: number;
  minor: number;
  patch: number;
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Stable release tags of a GitHub repo, no pre-releases: "v18.20.8", "17.3.12", or with a package
 * prefix in monorepos ("svelte@5.57.2" with prefix "svelte@").
 */
export async function listReleaseTags(repo: string, prefix = ''): Promise<ReleaseTag[]> {
  const { stdout } = await git(['ls-remote', '--tags', '--refs', remote(repo)]);
  const re = new RegExp(`^${escapeRegex(prefix)}v?(\\d+)\\.(\\d+)\\.(\\d+)$`);
  return stdout
    .split('\n')
    .map((line) => line.split('refs/tags/')[1]?.trim())
    .map((tag) => ({ tag, match: tag && re.exec(tag) }))
    .filter((t): t is { tag: string; match: RegExpExecArray } => !!t.match)
    .map(({ tag, match }) => ({ tag, major: +match[1], minor: +match[2], patch: +match[3] }));
}

export async function listBranches(repo: string): Promise<string[]> {
  const { stdout } = await git(['ls-remote', '--heads', remote(repo)]);
  return stdout
    .split('\n')
    .map((line) => line.split('refs/heads/')[1]?.trim())
    .filter((b): b is string => !!b);
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
 * Commit history without file contents (a few MB even for big repos), for questions like
 * "which commit added this file?". Updated on every call.
 */
export async function historyClone(cacheDir: string, repo: string, branch: string): Promise<string> {
  const dir = join(cacheDir, `${repo.replace('/', '__')}@history`);
  if (existsSync(join(dir, '.git')) || existsSync(join(dir, 'HEAD'))) {
    await git(['fetch', '--filter=blob:none', 'origin', `+${branch}:${branch}`], dir);
  } else {
    await git(['clone', '--filter=blob:none', '--bare', '--single-branch', '--branch', branch, remote(repo), dir]);
  }
  return dir;
}

/**
 * Shallow, sparse checkout of `paths` at `ref` (branch, tag or commit SHA). Only the docs folders
 * are materialized, which keeps checkouts small and avoids Windows path-length failures on
 * unrelated files. Returns the checkout directory and the commit it points at.
 */
export async function checkoutDocs(
  cacheDir: string,
  repo: string,
  ref: string,
  paths: string[],
): Promise<{ dir: string; commit: string }> {
  const label = /^[0-9a-f]{40}$/.test(ref) ? ref.slice(0, 12) : ref;
  const dir = join(cacheDir, `${repo.replace('/', '__')}@${label}`);
  if (!existsSync(join(dir, '.git'))) {
    await git(['init', '-q', dir]);
    await git(['remote', 'add', 'origin', remote(repo)], dir);
  }
  // Narrow the checkout before fetching, so nothing outside `paths` is ever written to disk.
  await git(['sparse-checkout', 'set', ...paths], dir);
  await git(['fetch', '--depth', '1', '--filter=blob:none', 'origin', ref], dir);
  await git(['checkout', '--force', 'FETCH_HEAD'], dir);
  return { dir, commit: await gitIn(dir, ['rev-parse', 'HEAD']) };
}
