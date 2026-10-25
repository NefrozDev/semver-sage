import { hexoSlug, kebabSlug } from '../chunker';
import { htmlUrlPath, loadMarkdownPages } from './markdown-repo';
import type { SourceAdapter } from './types';

/**
 * Vue 2 docs live in vuejs/v2.vuejs.org (Hexo), Vue 3 docs in vuejs/docs (VitePress).
 * Each repo only carries its latest docs, so they're indexed as majors "2" and "3".
 */
export const vueAdapter: SourceAdapter = {
  framework: 'vue',
  versions: async () => [
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
    const isV2 = source.version === '2';
    return loadMarkdownPages(checkoutDir, source, {
      slugify: (heading) => (isV2 ? hexoSlug(heading) : kebabSlug(heading)),
      // v2: "src/v2/guide/computed.md" -> "v2/guide/computed.html"
      // v3: "src/guide/essentials/computed.md" -> "guide/essentials/computed.html"
      toUrlPath: (sourcePath) => htmlUrlPath(sourcePath, 'src/'),
    });
  },
};
