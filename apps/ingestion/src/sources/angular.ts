import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { kebabSlug } from '../chunker';
import { latestPerMajor, listReleaseTags } from '../git';
import { loadMarkdownPages } from './markdown-repo';
import type { SourceAdapter, VersionSource } from './types';

const REPO = 'angular/angular';
const MIN_MAJOR = 2;
/** The Angular 2 site's repo, at its last commit before Angular 4.0 shipped (2017-03-22). */
const ANGULAR_IO_REPO = 'angular/angular.io';
const ANGULAR_IO_V2_COMMIT = '8d307c53da0b711220af96e67bb74a0d9acb23b6';
const ANGULAR_IO_DOCS = 'public/docs/ts/latest';
const ANGULAR_IO_FOLDERS = ['guide', 'cookbook', 'tutorial'];
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
      return `\n\`\`\`${language}\n${decodeEntities(body.replace(/^\n+/, '').trimEnd())}\n\`\`\`\n`;
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

/**
 * Angular 2's angular.io was its own repo of Jade templates, prose in `:marked` blocks and inline
 * `code-example(...)` blocks. Keep just those, as markdown, under the page title.
 */
export function jadeToMarkdown(jade: string, title: string | null): string {
  const lines = jade.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = title ? [`# ${title}`, ''] : [];
  for (let i = 0; i < lines.length; i++) {
    const marked = /^(\s*):marked\s*$/.exec(lines[i]);
    const code = /^(\s*)code-example\(([^)]*)\)\.?\s*$/.exec(lines[i]);
    const start = marked ?? code;
    if (!start) continue;
    const indent = start[1].length;
    const block: string[] = [];
    while (i + 1 < lines.length && (!lines[i + 1].trim() || lines[i + 1].search(/\S/) > indent)) {
      block.push(lines[++i]);
    }
    const contentIndent = Math.min(...block.filter((l) => l.trim()).map((l) => l.search(/\S/)));
    const text = block.map((l) => l.slice(contentIndent)).join('\n').trim();
    if (!text) continue;
    if (marked) out.push(text, '');
    else out.push(`\`\`\`${/language="([\w-]+)"/.exec(code?.[2] ?? '')?.[1] ?? ''}`, decodeEntities(text), '```', '');
  }
  return out.join('\n');
}

/** Page titles of the Angular 2 site, from each folder's _data.json ({ "architecture": { "title": ... } }). */
async function angularIoTitles(checkoutDir: string): Promise<Map<string, string>> {
  const titles = new Map<string, string>();
  for (const folder of ANGULAR_IO_FOLDERS) {
    try {
      const data = JSON.parse(await readFile(join(checkoutDir, ANGULAR_IO_DOCS, folder, '_data.json'), 'utf8'));
      for (const [page, meta] of Object.entries<{ title?: string }>(data)) {
        if (meta.title) titles.set(`${folder}/${page}`, meta.title);
      }
    } catch {
      // folder without _data.json
    }
  }
  return titles;
}

/**
 * Angular guides at the newest release of each major since 2: Angular 2 from the old angular.io
 * repo (v2.angular.io), 4–17 from angular/angular aio/ (vNN.angular.io), 18+ from adev/
 * (vNN.angular.dev). There never was an Angular 3.
 */
export const angularAdapter: SourceAdapter = {
  framework: 'angular',

  async versions(): Promise<VersionSource[]> {
    const tags = latestPerMajor(await listReleaseTags(REPO), (t) => t.major >= MIN_MAJOR);
    return tags.map((t) =>
      t.major === 2
        ? {
            version: '2',
            repo: ANGULAR_IO_REPO,
            ref: ANGULAR_IO_V2_COMMIT,
            paths: ANGULAR_IO_FOLDERS.map((f) => `${ANGULAR_IO_DOCS}/${f}`),
            docsBaseUrl: `https://v2.angular.io/${ANGULAR_IO_DOCS.replace(/^public\//, '')}/`,
          }
        : t.major <= LAST_AIO_MAJOR
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
    if (source.repo === ANGULAR_IO_REPO) {
      const titles = await angularIoTitles(checkoutDir);
      const page = (sourcePath: string) => sourcePath.slice(ANGULAR_IO_DOCS.length + 1).replace(/\.jade$/, '');
      return loadMarkdownPages(checkoutDir, source, {
        extensions: ['.jade'],
        slugify: (heading) => kebabSlug(heading),
        preprocess: (jade, sourcePath) => jadeToMarkdown(jade, titles.get(page(sourcePath)) ?? null),
        // "public/docs/ts/latest/guide/architecture.jade" -> "guide/architecture.html"; "_*" are partials
        toUrlPath: (sourcePath) => (/\/_[^/]*$/.test(sourcePath) ? null : `${page(sourcePath)}.html`),
      });
    }
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
