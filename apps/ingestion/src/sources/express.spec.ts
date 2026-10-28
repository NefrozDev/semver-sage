import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanExpressMdx, expressAdapter, expressUrlPath } from './express';

describe('expressUrlPath', () => {
  it.each([
    ['src/content/api/5x/api/request/index.mdx', 'en/5x/api/request/'],
    ['src/content/api/3x/api.mdx', 'en/3x/api/'],
    ['src/content/docs/en/4x/guide/routing.mdx', 'en/4x/guide/routing/'],
  ])('%s', (sourcePath, url) => {
    expect(expressUrlPath(sourcePath)).toBe(url);
  });
});

describe('cleanExpressMdx', () => {
  it('drops component imports but not code', () => {
    const md = "import Alert from '@components/Alert.astro';\nText\n```js\nimport express from 'express';\n```";
    expect(cleanExpressMdx(md)).toBe("Text\n```js\nimport express from 'express';\n```");
  });
});

describe('expressAdapter', () => {
  it('indexes Express 1 and 2 from the framework repo, then 3 to 5 from expressjs.com', async () => {
    const versions = await expressAdapter.versions({ repoCacheDir: '' });
    expect(versions.map((v) => [v.version, v.repo, v.ref, v.docsBaseUrl])).toEqual([
      ['1', 'expressjs/express', '1.0.8', 'https://github.com/expressjs/express/blob/1.0.8/'],
      ['2', 'expressjs/express', '2.5.11', 'https://github.com/expressjs/express/blob/2.5.11/'],
      ['3', 'expressjs/expressjs.com', 'main', 'https://expressjs.com/'],
      ['4', 'expressjs/expressjs.com', 'main', 'https://expressjs.com/'],
      ['5', 'expressjs/expressjs.com', 'main', 'https://expressjs.com/'],
    ]);
  });

  describe('loadPages (Express 1-2)', () => {
    let dir: string;
    beforeEach(async () => {
      dir = await mkdtemp(join(tmpdir(), 'express-docs-'));
      await mkdir(join(dir, 'docs'));
    });
    afterEach(() => rm(dir, { recursive: true, force: true }));

    it('titles each docs page and skips contributing notes and screencasts', async () => {
      const text = 'Express supports the following shortcut methods for routing, mapping HTTP verbs to handlers.';
      await writeFile(join(dir, 'docs/guide.md'), `### Routing\n\n${text}`);
      await writeFile(join(dir, 'docs/contrib.md'), `### Contributing\n\n${text}`);
      await writeFile(join(dir, 'docs/screencasts.md'), `### Screencasts\n\n${text}`);
      const [, express2] = await expressAdapter.versions({ repoCacheDir: '' });

      const pages = await expressAdapter.loadPages(dir, express2);

      expect(pages.map((p) => p.urlPath)).toEqual(['docs/guide.md']);
      expect(pages[0].chunks[0]).toMatchObject({ pageTitle: 'Guide', section: 'Routing', anchor: 'routing' });
    });
  });
});
