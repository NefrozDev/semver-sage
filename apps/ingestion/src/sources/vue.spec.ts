import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { vueAdapter } from './vue';

describe('vueAdapter', () => {
  it('indexes Vue 0.10 to 3 in order, each cited on its own site (0.10 on GitHub)', async () => {
    const versions = await vueAdapter.versions({ repoCacheDir: '' });
    expect(versions.map((v) => [v.version, v.repo, v.ref, v.docsBaseUrl])).toEqual([
      ['0.10', 'vuejs/vuejs.org', '0.10', 'https://github.com/vuejs/vuejs.org/blob/0.10/{source}'],
      ['0.11', 'vuejs/vuejs.org', '0.11', 'https://011.vuejs.org/'],
      ['0.12', 'vuejs/vuejs.org', '0.12', 'https://012.vuejs.org/'],
      ['1', 'vuejs/vuejs.org', '1.0', 'https://v1.vuejs.org/'],
      ['2', 'vuejs/v2.vuejs.org', 'master', 'https://v2.vuejs.org/'],
      ['3', 'vuejs/docs', 'main', 'https://vuejs.org/'],
    ]);
  });

  describe('loadPages', () => {
    let dir: string;
    const write = async (path: string, content: string) => {
      await mkdir(dirname(join(dir, path)), { recursive: true });
      await writeFile(join(dir, path), content);
    };

    beforeEach(async () => {
      dir = await mkdtemp(join(tmpdir(), 'vue-docs-'));
    });
    afterEach(() => rm(dir, { recursive: true, force: true }));

    it('maps Vue 0.x files under source/ to the same routes as the later sites', async () => {
      const [v010] = await vueAdapter.versions({ repoCacheDir: '' });
      await write('source/guide/filters.md', '---\ntitle: Filters\n---\n\n## Filter Arguments\n\nSome filters can take arguments, separated by spaces from the filter name and each other.');
      await write('source/api/index.md', '---\ntitle: API\n---\n\n## Vue.extend\n\nCreate a subclass of the base Vue constructor, which can be instantiated with new.');

      const pages = await vueAdapter.loadPages(dir, v010);

      expect(pages.map((p) => [p.urlPath, p.sourcePath])).toEqual([
        ['api/', 'source/api/index.md'],
        ['guide/filters.html', 'source/guide/filters.md'],
      ]);
      expect(pages[1].chunks[0]).toMatchObject({ section: 'Filter Arguments', anchor: 'Filter-Arguments' });
    });

    it('maps guide and API files to v1.vuejs.org routes with Hexo anchors', async () => {
      const [, , , v1] = await vueAdapter.versions({ repoCacheDir: '' });
      await write('src/guide/computed.md', '---\ntitle: Computed Properties\n---\n\n## Computed Setter\n\nComputed properties are by default getter-only, but you can also provide a setter when you need it.');
      await write('src/api/index.md', '---\ntitle: API\n---\n\n## Vue.extend( options )\n\nCreate a subclass of the base Vue constructor. The argument should be an object containing component options.');

      const pages = await vueAdapter.loadPages(dir, v1);

      expect(pages.map((p) => p.urlPath)).toEqual(['api/', 'guide/computed.html']);
      expect(pages[1].chunks[0]).toMatchObject({ section: 'Computed Setter', anchor: 'Computed-Setter' });
    });
  });
});
