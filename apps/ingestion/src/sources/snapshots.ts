import type { VersionSource } from './types';

/** A docs version taken from a repo's history: the repo as it stood just before `before` (UTC date). */
export interface DatedSnapshot {
  version: string;
  before: string;
}

/** Resolves each snapshot to a commit, in order, and builds its source. */
export async function snapshotSources(
  snapshots: DatedSnapshot[],
  commitAt: (before: string) => Promise<string>,
  toSource: (version: string, ref: string) => VersionSource,
): Promise<VersionSource[]> {
  const sources: VersionSource[] = [];
  for (const { version, before } of snapshots) sources.push(toSource(version, await commitAt(before)));
  return sources;
}
