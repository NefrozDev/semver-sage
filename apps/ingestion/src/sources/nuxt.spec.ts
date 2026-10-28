import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanNuxtMdc, nuxt1Version, nuxtAdapter } from './nuxt';

describe('cleanNuxtMdc', () => {
  it('turns callouts into labels and drops inline components', () => {
    const md = [
      '::note',
      'Call it in setup.',
      '::',
      ':read-more{to="/docs/guide"}',
      '::tip{to="/docs/x"}',
      'Use createUseFetch.',
      '::',
      '```ts',
      '::not-mdc-inside-code',
      '```',
    ].join('\n');
    expect(cleanNuxtMdc(md)).toBe(
      ['**Note**', 'Call it in setup.', '**Tip**', 'Use createUseFetch.', '```ts', '::not-mdc-inside-code', '```'].join(
        '\n',
      ),
    );
  });
});

describe('nuxt1Version', () => {
  it('snapshots nuxt/docs just before Nuxt 2 shipped, cited on GitHub at the commit', async () => {
    const commitAt = vi.fn(async (before: string) => `sha-${before}`);
    expect(await nuxt1Version(commitAt)).toEqual([
      {
        version: '1',
        repo: 'nuxt/docs',
        ref: 'sha-2018-09-21',
        paths: ['en/guide', 'en/api', 'en/faq'],
        docsBaseUrl: 'https://github.com/nuxt/docs/blob/sha-2018-09-21/{source}',
      },
    ]);
    expect(commitAt).toHaveBeenCalledTimes(1);
  });
});

describe('nuxtAdapter.loadPages (Nuxt 1)', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'nuxt1-docs-'));
    await mkdir(join(dir, 'en/guide'), { recursive: true });
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it('maps English pages to their nuxtjs.org routes, titled from the frontmatter', async () => {
    const body = 'Nuxt.js automatically generates the vue-router configuration based on your file tree.';
    await writeFile(join(dir, 'en/guide/routing.md'), `---\ntitle: Routing\n---\n\n## Basic Routes\n\n${body}`);
    await writeFile(join(dir, 'en/guide/index.md'), `---\ntitle: Introduction\n---\n\n## What is Nuxt.js?\n\n${body}`);
    const [nuxt1] = await nuxt1Version(async () => 'abc');

    const pages = await nuxtAdapter.loadPages(dir, nuxt1);

    expect(pages.map((p) => [p.urlPath, p.sourcePath])).toEqual([
      ['guide', 'en/guide/index.md'],
      ['guide/routing', 'en/guide/routing.md'],
    ]);
    expect(pages[1].chunks[0]).toMatchObject({ pageTitle: 'Routing', section: 'Basic Routes', anchor: 'basic-routes' });
  });
});
