// Runs the SonarQube scanner (in Docker, so no Java install) against SonarQube Cloud with
// SONAR_TOKEN, SONAR_ORGANIZATION and SONAR_PROJECT_KEY (as shown on the project's page there).
// Before scanning, merges every coverage/**/lcov.info into coverage/lcov.merged.info with paths
// relative to the repo: Vitest writes them relative to each project, with OS-specific separators.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('..', import.meta.url));
try {
  process.loadEnvFile(join(repo, '.env'));
} catch {
  // no .env: environment variables only
}

const hostUrl = process.env.SONAR_HOST_URL ?? 'https://sonarcloud.io';
const token = process.env.SONAR_TOKEN;
if (!token) {
  console.error('SONAR_TOKEN is not set (create one in SonarQube Cloud: My Account > Security).');
  process.exit(1);
}

/** coverage/apps/api/lcov.info -> apps/api: where that project's relative paths start from. */
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
  const projectRoot = relative(coverageDir, join(file, '..'));
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line.startsWith('SF:')) {
      merged.push(line);
      continue;
    }
    const path = line.slice(3).replaceAll('\\', '/');
    const fromProject = join(projectRoot, path);
    const repoPath = existsSync(join(repo, fromProject)) ? fromProject : path;
    merged.push(`SF:${repoPath.split(sep).join('/')}`);
  }
}
if (!merged.length) console.warn('No coverage reports found: run `npm run test:coverage` first.');
writeFileSync(join(coverageDir, 'lcov.merged.info'), merged.join('\n'));

const args = [
  'run', '--rm',
  '-e', `SONAR_HOST_URL=${hostUrl}`,
  '-e', 'SONAR_TOKEN',
  '-v', `${repo}:/usr/src`,
  'sonarsource/sonar-scanner-cli:latest',
  ...(process.env.SONAR_QUALITYGATE_WAIT === 'true' ? ['-Dsonar.qualitygate.wait=true'] : []),
  ...(process.env.SONAR_ORGANIZATION ? [`-Dsonar.organization=${process.env.SONAR_ORGANIZATION}`] : []),
  ...(process.env.SONAR_PROJECT_KEY ? [`-Dsonar.projectKey=${process.env.SONAR_PROJECT_KEY}`] : []),
  ...process.argv.slice(2),
];
const result = spawnSync('docker', args, { stdio: 'inherit', env: { ...process.env, SONAR_TOKEN: token } });
process.exit(result.status ?? 1);
