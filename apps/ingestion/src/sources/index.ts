import type { Framework } from '@semver-sage/types';
import { angularAdapter } from './angular';
import { expressAdapter } from './express';
import { nestjsAdapter } from './nestjs';
import { nextjsAdapter } from './nextjs';
import { nodeAdapter } from './node';
import { nuxtAdapter } from './nuxt';
import { reactAdapter } from './react';
import { svelteAdapter } from './svelte';
import type { SourceAdapter } from './types';
import { typescriptAdapter } from './typescript';
import { vueAdapter } from './vue';

/** Every framework's docs source. Add an adapter here when adding a framework. */
export const ADAPTERS: Record<Framework, SourceAdapter> = {
  angular: angularAdapter,
  express: expressAdapter,
  nestjs: nestjsAdapter,
  nextjs: nextjsAdapter,
  node: nodeAdapter,
  nuxt: nuxtAdapter,
  react: reactAdapter,
  svelte: svelteAdapter,
  typescript: typescriptAdapter,
  vue: vueAdapter,
};

export type { AdapterContext, SourceAdapter, SourcePage, VersionSource } from './types';
