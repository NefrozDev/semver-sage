import {
  AskRequest,
  detectFrameworks,
  FRAMEWORKS,
  parseVersion,
  ResolvedScope,
  versionToNum,
  type Framework,
} from '@semver-sage/types';

export interface IndexedVersionRow {
  framework: Framework;
  version: string;
  versionNum: number;
}

export interface SearchScope extends ResolvedScope {
  /** Version to filter on; null means "latest indexed version of every framework". */
  versionNum: number | null;
}

/**
 * Decides which framework + indexed docs version a question is about.
 * Explicit request fields win over what's detected in the question; a requested version maps to
 * the newest indexed version at or below it (e.g. "2.6" -> "2" when majors are indexed).
 */
export function resolveScope(request: AskRequest, indexed: IndexedVersionRow[]): SearchScope {
  const mentions = detectFrameworks(request.question);
  const framework = request.framework ?? mentions[0]?.framework ?? null;

  if (!framework) {
    return { framework: null, requestedVersion: null, version: null, versionNum: null, source: 'none' };
  }

  const source = request.framework ? 'request' : 'question';
  const requestedVersion =
    request.version?.trim() ||
    mentions.find((m) => m.framework === framework && m.version)?.version ||
    null;
  const label = FRAMEWORKS[framework].label;
  const available = indexed
    .filter((v) => v.framework === framework)
    .sort((a, b) => a.versionNum - b.versionNum);

  if (!available.length) {
    return {
      framework,
      requestedVersion,
      version: null,
      versionNum: null,
      source,
      note: `${label} docs aren't indexed yet.`,
    };
  }

  const latest = available[available.length - 1];
  if (!requestedVersion || !parseVersion(requestedVersion)) {
    return { framework, requestedVersion: null, version: latest.version, versionNum: latest.versionNum, source: requestedVersion ? source : 'latest' };
  }

  const wanted = versionToNum(requestedVersion);
  const match = [...available].reverse().find((v) => v.versionNum <= wanted) ?? available[0];
  const scope: SearchScope = {
    framework,
    requestedVersion,
    version: match.version,
    versionNum: match.versionNum,
    source,
  };
  const wantedMajor = parseVersion(requestedVersion)?.major;
  if (wantedMajor !== parseVersion(match.version)?.major) {
    const indexedList = available.map((v) => v.version).join(', ');
    scope.note = `${label} ${requestedVersion} isn't indexed (indexed: ${indexedList}); answering from ${label} ${match.version}.`;
  }
  return scope;
}
