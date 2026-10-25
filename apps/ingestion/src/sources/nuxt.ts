import { kebabSlug } from '../chunker';
import { latestPerMajor, listReleaseTags } from '../git';
import { loadMarkdownPages, stripOrderPrefixes } from './markdown-repo';
import type { SourceAdapter, VersionSource } from './types';

const REPO = 'nuxt/nuxt';
const MIN_MAJOR = 3;
const CALLOUTS = new Set(['note', 'tip', 'warning', 'important', 'caution', 'alert', 'read-more']);

/**
 * Nuxt docs use MDC components: `::note ... ::` blocks become a bold label plus their text;
 * inline components on their own line (`:read-more{to="..."}`, `:link-example{...}`) are dropped.
 */
export function cleanNuxtMdc(markdown: string): string {
  const out: string[] = [];
  let inFence = false;
  for (const line of markdown.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    if (inFence) {
      out.push(line);
      continue;
    }
    const block = /^\s*::+([\w-]+)?(\{.*\})?\s*$/.exec(line);
    if (block) {
      const name = block[1];
      if (name && CALLOUTS.has(name) && name !== 'read-more') out.push(`**${name[0].toUpperCase()}${name.slice(1)}**`);
      continue;
    }
    if (/^\s*:[\w-]+\{.*\}\s*$/.test(line)) continue;
    out.push(line);
  }
  return out.join('\n');
}

/**
 * Nuxt 2 docs live in nuxt/website-v2 (v2.nuxt.com); Nuxt 3+ in nuxt/nuxt `docs/` at the newest
 * release of each major, cited on nuxt.com/docs/<major>.x/.
 */
export const nuxtAdapter: SourceAdapter = {
  framework: 'nuxt',

  async versions() {
    const tags = latestPerMajor(await listReleaseTags(REPO), (t) => t.major >= MIN_MAJOR);
    return [
      {
        version: '2',
        repo: 'nuxt/website-v2',
        ref: 'main',
        paths: ['content/en/docs'],
        docsBaseUrl: 'https://v2.nuxt.com/',
      },
      ...tags.map((t): VersionSource => ({
        version: String(t.major),
        repo: REPO,
        ref: t.tag,
        paths: ['docs'],
        docsBaseUrl: `https://nuxt.com/docs/${t.major}.x/`,
      })),
    ];
  },

  loadPages(checkoutDir, source) {
    return loadMarkdownPages(checkoutDir, source, {
      slugify: (heading) => kebabSlug(heading),
      preprocess: cleanNuxtMdc,
      toUrlPath: (sourcePath) => {
        if (/(^|\/)(\d+\.)?community\//.test(sourcePath)) return null;
        // v2: "content/en/docs/3.features/4.data-fetching.md" -> "docs/features/data-fetching"
        if (sourcePath.startsWith('content/en/docs/')) {
          return `docs/${stripOrderPrefixes(sourcePath.slice('content/en/docs/'.length))}`;
        }
        // v3+: "docs/4.api/2.composables/use-fetch.md" -> "api/composables/use-fetch"
        return stripOrderPrefixes(sourcePath.replace(/^docs\//, ''));
      },
    });
  },
};
