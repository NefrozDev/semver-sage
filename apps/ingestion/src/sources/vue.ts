import { SOURCE_PLACEHOLDER } from '@semver-sage/server-core';
import { hexoSlug, kebabSlug } from '../chunker';
import { githubBlobBase, htmlUrlPath, loadMarkdownPages } from './markdown-repo';
import type { SourceAdapter, VersionSource } from './types';

/** Vue 0.x: one vuejs/vuejs.org branch per minor, in `source/`. 0.11 and 0.12 still have a site. */
const LEGACY: VersionSource[] = ['0.10', '0.11', '0.12'].map((version) => ({
  version,
  repo: 'vuejs/vuejs.org',
  ref: version,
  paths: ['source/guide', 'source/api'],
  docsBaseUrl:
    version === '0.10'
      ? githubBlobBase('vuejs/vuejs.org', version) + SOURCE_PLACEHOLDER
      : `https://${version.replace('.', '')}.vuejs.org/`,
}));

/**
 * Vue 0.x and 1 docs live on branches of vuejs/vuejs.org and Vue 2 in vuejs/v2.vuejs.org (all
 * Hexo), Vue 3 in vuejs/docs (VitePress). Each only carries its latest docs, so they're indexed as
 * 0.x minors and majors "1", "2" and "3".
 */
export const vueAdapter: SourceAdapter = {
  framework: 'vue',
  versions: async () => [
    ...LEGACY,
    {
      version: '1',
      repo: 'vuejs/vuejs.org',
      ref: '1.0',
      paths: ['src/guide', 'src/api'],
      docsBaseUrl: 'https://v1.vuejs.org/',
    },
    {
      version: '2',
      repo: 'vuejs/v2.vuejs.org',
      ref: 'master',
      paths: ['src/v2/guide', 'src/v2/api', 'src/v2/style-guide', 'src/v2/cookbook'],
      docsBaseUrl: 'https://v2.vuejs.org/',
    },
    {
      version: '3',
      repo: 'vuejs/docs',
      ref: 'main',
      paths: ['src/guide', 'src/api', 'src/style-guide', 'src/glossary'],
      docsBaseUrl: 'https://vuejs.org/',
    },
  ],

  loadPages(checkoutDir, source) {
    const isHexo = source.version !== '3';
    return loadMarkdownPages(checkoutDir, source, {
      slugify: (heading) => (isHexo ? hexoSlug(heading) : kebabSlug(heading)),
      // v0.x: "source/guide/computed.md" -> "guide/computed.html"
      // v1: "src/guide/computed.md" -> "guide/computed.html"
      // v2: "src/v2/guide/computed.md" -> "v2/guide/computed.html"
      // v3: "src/guide/essentials/computed.md" -> "guide/essentials/computed.html"
      toUrlPath: (sourcePath) => htmlUrlPath(sourcePath, sourcePath.startsWith('source/') ? 'source/' : 'src/'),
    });
  },
};
