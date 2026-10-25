// Merges every coverage/**/lcov.info into coverage/lcov.merged.info (read by SonarQube Cloud, see
// sonar-project.properties) with paths relative to the repo: Vitest writes them relative to each
// project, with OS-specific separators.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('..', import.meta.url));

function lcovFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return lcovFiles(path);
    return name === 'lcov.info' ? [path] : [];
  });
}

const coverageDir = join(repo, 'coverage');
const merged = [];
for (const file of existsSync(coverageDir) ? lcovFiles(coverageDir) : []) {
  // coverage/apps/api/lcov.info -> apps/api: where that project's relative paths start from
  const projectRoot = relative(coverageDir, join(file, '..'));
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line.startsWith('SF:')) {
      merged.push(line);
      continue;
    }
    const path = line.slice(3).replaceAll('\\', '/');
    const fromProject = join(projectRoot, path);
    const repoPath = existsSync(join(repo, fromProject)) ? fromProject : path;
    merged.push(`SF:${repoPath.replaceAll(sep, '/')}`);
  }
}
if (!merged.length) {
  console.error('No coverage reports found: run the tests with --coverage first.');
  process.exit(1);
}
writeFileSync(join(coverageDir, 'lcov.merged.info'), merged.join('\n'));
console.log(`Merged coverage into ${relative(repo, join(coverageDir, 'lcov.merged.info'))}`);
