import { SOURCE_PLACEHOLDER } from '@semver-sage/server-core';
import { githubSlug, kebabSlug } from '../chunker';
import { commitBefore, historyClone, latestPerMajor, listReleaseTags } from '../git';
import { githubBlobBase, loadMarkdownPages, stripOrderPrefixes } from './markdown-repo';
import { snapshotSources } from './snapshots';
import type { SourceAdapter, VersionSource } from './types';

const REPO = 'nuxt/nuxt';
const MIN_MAJOR = 3;
/** Nuxt 1 docs: nuxt/docs (archived) just before Nuxt 2.0.0 shipped, cited on GitHub. */
const NUXT1_REPO = 'nuxt/docs';
const NUXT1_BEFORE = '2018-09-21';

/** Nuxt 1 at a nuxt/docs commit: English guide, API and FAQ pages, under their nuxtjs.org routes. */
export function nuxt1Version(commitAt: (before: string) => Promise<string>): Promise<VersionSource[]> {
  return snapshotSources([{ version: '1', before: NUXT1_BEFORE }], commitAt, (version, ref) => ({
    version,
    repo: NUXT1_REPO,
    ref,
    paths: ['en/guide', 'en/api', 'en/faq'],
    docsBaseUrl: githubBlobBase(NUXT1_REPO, ref) + SOURCE_PLACEHOLDER,
  }));
}
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
 * Nuxt 1 docs come from a nuxt/docs snapshot, Nuxt 2 from nuxt/website-v2 (v2.nuxt.com), Nuxt 3+
 * from nuxt/nuxt `docs/` at the newest release of each major, cited on nuxt.com/docs/<major>.x/.
 */
export const nuxtAdapter: SourceAdapter = {
  framework: 'nuxt',

  async versions({ repoCacheDir }) {
    const tags = latestPerMajor(await listReleaseTags(REPO), (t) => t.major >= MIN_MAJOR);
    const history = await historyClone(repoCacheDir, NUXT1_REPO, 'master');
    return [
      ...(await nuxt1Version((before) => commitBefore(history, 'master', before))),
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
    if (source.repo === NUXT1_REPO) {
      return loadMarkdownPages(checkoutDir, source, {
        slugify: (heading) => githubSlug(heading),
        // "en/guide/routing.md" -> "guide/routing", "en/guide/index.md" -> "guide"
        toUrlPath: (sourcePath) => sourcePath.replace(/^en\//, '').replace(/\.md$/, '').replace(/\/index$/, ''),
      });
    }
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
