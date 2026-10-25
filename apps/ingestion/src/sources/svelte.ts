import { posix } from 'node:path';
import { githubSlug } from '../chunker';
import { latestPerMajor, listReleaseTags } from '../git';
import { githubBlobBase, loadMarkdownPages, stripOrderPrefixes } from './markdown-repo';
import type { SourceAdapter, VersionSource } from './types';

const REPO = 'sveltejs/svelte';
const MIN_MAJOR = 3;

/** svelte.dev (5+): case kept, "$" and "." kept: "Deep state" -> "Deep-state", "$state.raw". */
export const svelte5Slug = (heading: string) =>
  heading
    .replace(/[^\p{L}\p{N}$._\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');

/** v4.svelte.dev: lowercase, h3+ prefixed with the parent h2: "script-1-export-creates-a-component-prop". */
export const svelte4Slug = (heading: string, parents: string[]) => {
  const slug = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}$\s-]/gu, ' ')
      .trim()
      .replace(/[\s-]+/g, '-');
  return [...parents.slice(0, 1), heading].map(slug).join('-');
};

/**
 * Svelte docs from sveltejs/svelte at the newest release of each major: 3 (site/content/docs,
 * no hosted site left: cited on GitHub), 4 (v4.svelte.dev) and 5+ (svelte.dev/docs/svelte).
 */
export const svelteAdapter: SourceAdapter = {
  framework: 'svelte',

  async versions() {
    // Releases are tagged "v3.59.2" up to 3.x and "svelte@5.57.2" since.
    const tags = latestPerMajor(
      [...(await listReleaseTags(REPO)), ...(await listReleaseTags(REPO, 'svelte@'))],
      (t) => t.major >= MIN_MAJOR,
    );
    const latest = Math.max(...tags.map((t) => t.major));
    return tags.map((t): VersionSource => ({
      version: String(t.major),
      repo: REPO,
      ref: t.tag,
      paths: [t.major === 3 ? 'site/content/docs' : 'documentation/docs'],
      docsBaseUrl:
        t.major === 3
          ? githubBlobBase(REPO, t.tag)
          : t.major === 4
            ? 'https://v4.svelte.dev/docs/'
            : t.major === latest
              ? 'https://svelte.dev/docs/svelte/'
              : `https://v${t.major}.svelte.dev/docs/svelte/`,
    }));
  },

  loadPages(checkoutDir, source) {
    const major = Number(source.version);
    return loadMarkdownPages(checkoutDir, source, {
      slugify: (heading, _path, parents) =>
        major === 3 ? githubSlug(heading) : major === 4 ? svelte4Slug(heading, parents) : svelte5Slug(heading),
      toUrlPath: (sourcePath) => {
        if (major === 3) return sourcePath;
        // "documentation/docs/02-runes/02-$state.md" -> "$state"; section index pages have no content of their own
        if (posix.basename(sourcePath) === 'index.md') return null;
        return posix.basename(stripOrderPrefixes(sourcePath));
      },
    });
  },
};
