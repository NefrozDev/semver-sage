import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const git = (args: string[], cwd?: string) =>
  exec('git', ['-c', 'core.longpaths=true', ...args], { cwd, maxBuffer: 16 * 1024 * 1024 });

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
