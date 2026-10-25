import type { Framework } from '@semver-sage/types';
import type { SourceAdapter } from './types';
import { angularAdapter } from './angular';
import { reactAdapter } from './react';
import { svelteAdapter } from './svelte';
import { nextjsAdapter } from './nextjs';
import { nodeAdapter } from './node';
import { vueAdapter } from './vue';

/** Frameworks that can be ingested. Add an adapter here to support a new framework. */
export const ADAPTERS: Partial<Record<Framework, SourceAdapter>> = {
  vue: vueAdapter,
  node: nodeAdapter,
  nextjs: nextjsAdapter,
  angular: angularAdapter,
  react: reactAdapter,
  svelte: svelteAdapter,
};

export type { AdapterContext, SourceAdapter, SourcePage, VersionSource } from './types';
