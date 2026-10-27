import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { vueAdapter } from './vue';

describe('vueAdapter', () => {
  it('indexes Vue 1, 2 and 3 in order, each cited on its own site', async () => {
    const versions = await vueAdapter.versions({ repoCacheDir: '' });
    expect(versions.map((v) => [v.version, v.repo, v.ref, v.docsBaseUrl])).toEqual([
      ['1', 'vuejs/vuejs.org', '1.0', 'https://v1.vuejs.org/'],
      ['2', 'vuejs/v2.vuejs.org', 'master', 'https://v2.vuejs.org/'],
      ['3', 'vuejs/docs', 'main', 'https://vuejs.org/'],
    ]);
  });

  describe('loadPages (Vue 1)', () => {
    let dir: string;
    const write = async (path: string, content: string) => {
      await mkdir(dirname(join(dir, path)), { recursive: true });
      await writeFile(join(dir, path), content);
    };

    beforeEach(async () => {
      dir = await mkdtemp(join(tmpdir(), 'vue-docs-'));
    });
    afterEach(() => rm(dir, { recursive: true, force: true }));

    it('maps guide and API files to v1.vuejs.org routes with Hexo anchors', async () => {
      const [v1] = await vueAdapter.versions({ repoCacheDir: '' });
      await write('src/guide/computed.md', '---\ntitle: Computed Properties\n---\n\n## Computed Setter\n\nComputed properties are by default getter-only, but you can also provide a setter when you need it.');
      await write('src/api/index.md', '---\ntitle: API\n---\n\n## Vue.extend( options )\n\nCreate a subclass of the base Vue constructor. The argument should be an object containing component options.');

      const pages = await vueAdapter.loadPages(dir, v1);

      expect(pages.map((p) => p.urlPath)).toEqual(['api/', 'guide/computed.html']);
      expect(pages[1].chunks[0]).toMatchObject({ section: 'Computed Setter', anchor: 'Computed-Setter' });
    });
  });
});
