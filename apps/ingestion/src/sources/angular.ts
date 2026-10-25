import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { kebabSlug } from '../chunker';
import { latestPerMajor, listReleaseTags } from '../git';
import { loadMarkdownPages } from './markdown-repo';
import type { SourceAdapter, VersionSource } from './types';

const REPO = 'angular/angular';
const MIN_MAJOR = 12;
/** angular.io (aio/) served the docs up to 17; angular.dev (adev/) from 18. */
const LAST_AIO_MAJOR = 17;
const ADEV_CONTENT = 'adev/src/content';
const ADEV_NAV = 'adev/src/app/sub-navigation-data.ts';

const decodeEntities = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');

/**
 * Inline <docs-code> / <code-example> blocks become fenced code; ones that only point at
 * example files (path="...") carry no text and are dropped. Old `{@a anchor}` markers go too.
 */
export function cleanAngularMarkdown(markdown: string): string {
  return markdown
    .replace(/\{@a [^}]*\}/g, '')
    .replace(/<(docs-code|code-example)(?=[\s/>])[^>]*\/>/g, '')
    .replace(/<(docs-code|code-example)(?=[\s>])([^>]*)>([\s\S]*?)<\/\1>/g, (_, _tag, attrs: string, body: string) => {
      if (!body.trim()) return '';
      const language = /language="([\w-]+)"/.exec(attrs)?.[1] ?? '';
      return `\n\`\`\`${language}\n${decodeEntities(body.replace(/^\n+|\s+$/g, ''))}\n\`\`\`\n`;
    });
}

/** angular.dev routes come from its navigation data: contentPath -> path. */
export function parseAdevRoutes(navSource: string): Map<string, string> {
  const routes = new Map<string, string>();
  for (const match of navSource.matchAll(/path:\s*'([^']+)',\s*contentPath:\s*'([^']+)'/g)) {
    routes.set(match[2], match[1]);
  }
  return routes;
}

async function adevRoutes(checkoutDir: string): Promise<Map<string, string>> {
  try {
    return parseAdevRoutes(await readFile(join(checkoutDir, ADEV_NAV), 'utf8'));
  } catch {
    return new Map();
  }
}

/** Angular guides from angular/angular at the newest release of each major since 12. */
export const angularAdapter: SourceAdapter = {
  framework: 'angular',

  async versions(): Promise<VersionSource[]> {
    const tags = latestPerMajor(await listReleaseTags(REPO), (t) => t.major >= MIN_MAJOR);
    return tags.map((t) =>
      t.major <= LAST_AIO_MAJOR
        ? {
            version: String(t.major),
            repo: REPO,
            ref: t.tag,
            paths: ['aio/content/guide'],
            docsBaseUrl: `https://v${t.major}.angular.io/`,
          }
        : {
            version: String(t.major),
            repo: REPO,
            ref: t.tag,
            paths: ['guide', 'introduction', 'best-practices', 'tools', 'ecosystem', 'reference']
              .map((p) => `${ADEV_CONTENT}/${p}`)
              .concat('adev/src/app'),
            docsBaseUrl: `https://v${t.major}.angular.dev/`,
          },
    );
  },

  async loadPages(checkoutDir, source) {
    const routes = await adevRoutes(checkoutDir);
    return loadMarkdownPages(checkoutDir, source, {
      slugify: (heading) => kebabSlug(heading),
      preprocess: (markdown) => cleanAngularMarkdown(markdown),
      toUrlPath: (sourcePath) => {
        // aio: "aio/content/guide/forms-overview.md" -> "guide/forms-overview"
        if (sourcePath.startsWith('aio/content/')) {
          return sourcePath.slice('aio/content/'.length).replace(/\.md$/, '');
        }
        if (!sourcePath.startsWith(`${ADEV_CONTENT}/`)) return null;
        // adev: "adev/src/content/guide/signals/overview.md" -> route "guide/signals"
        const contentPath = sourcePath.slice(ADEV_CONTENT.length + 1).replace(/\.md$/, '');
        return routes.get(contentPath) ?? contentPath.replace(/\/overview$/, '');
      },
    });
  },
};
