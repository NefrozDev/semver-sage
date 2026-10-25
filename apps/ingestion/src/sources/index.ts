import type { Framework } from '@semver-sage/types';
import type { SourceAdapter } from './types';
import { vueAdapter } from './vue';

/** Frameworks that can be ingested. Add an adapter here to support a new framework. */
export const ADAPTERS: Partial<Record<Framework, SourceAdapter>> = {
  vue: vueAdapter,
};

export type { SourceAdapter, SourcePage, VersionSource } from './types';
