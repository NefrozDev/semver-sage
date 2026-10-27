import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { ReleaseTag } from '../git';
import { legacyReactUrlPath, legacyReactVersions, react16Versions, reactAdapter, reactDevUrlPath } from './react';

const tag = (version: string): ReleaseTag => {
  const [major, minor, patch] = version.split('.').map(Number);
  return { tag: `v${version}`, major, minor, patch };
};

describe('legacyReactVersions', () => {
  const tags = [...['0.3.3', '0.14.2', '0.14.8', '15.6.1', '15.6.2', '15.7.0', '16.0.0', '17.0.2'].map(tag), {
    // Tagged without the "v", cut in 2020 from the 0.14 branch: no docs folder.
    tag: '0.14.10',
    major: 0,
    minor: 14,
    patch: 10,
  }];

  it('indexes the last release of each 0.x and 15.0–15.6 minor, cited on GitHub at its tag', () => {
    expect(legacyReactVersions(tags)).toEqual([
      expect.objectContaining({ version: '0.3', ref: 'v0.3.3' }),
      expect.objectContaining({ version: '0.14', ref: 'v0.14.8' }),
      expect.objectContaining({ version: '15.6', ref: 'v15.6.2' }),
    ]);
    expect(legacyReactVersions(tags)[2]).toEqual({
      version: '15.6',
      repo: 'facebook/react',
      ref: 'v15.6.2',
      paths: ['docs/docs', 'docs/tips', 'docs/tutorial'],
      docsBaseUrl: 'https://github.com/facebook/react/blob/v15.6.2/',
    });
  });

  it('skips the 2020 releases without docs (0.14.10, 15.7.0) and 16+ (reactjs.org)', () => {
    const refs = legacyReactVersions(tags).map((v) => v.ref);
    expect(refs).toContain('v0.14.8');
    expect(refs).not.toContain('0.14.10');
    expect(refs).not.toContain('v15.7.0');
    expect(refs.some((ref) => /^v1[67]\./.test(ref))).toBe(false);
  });
});

describe('react16Versions', () => {
  it('snapshots react.dev before each next release: 16.0 before 16.1.0 ... 16.14 before 17.0.0', async () => {
    const commitAt = vi.fn(async (before: string) => `sha-${before}`);
    const versions = await react16Versions(commitAt);

    expect(versions.map((v) => v.version)).toEqual(Array.from({ length: 15 }, (_, minor) => `16.${minor}`));
    expect(commitAt).toHaveBeenCalledTimes(15);
    expect(commitAt).toHaveBeenNthCalledWith(1, '2017-11-09');
    // 16.8 (hooks, released 2019-02-06) is the site as it stood when 16.9 shipped.
    expect(commitAt).toHaveBeenNthCalledWith(9, '2019-08-08');
    expect(commitAt).toHaveBeenLastCalledWith('2020-10-20');
    expect(versions[8]).toEqual({
      version: '16.8',
      repo: 'reactjs/react.dev',
      ref: 'sha-2019-08-08',
      paths: ['content/docs'],
      docsBaseUrl: 'https://16.reactjs.org/',
    });
  });

  it('propagates a failed snapshot lookup instead of indexing a wrong commit', async () => {
    const commitAt = vi.fn(async () => {
      throw new Error('No commit on main before 2017-11-09');
    });
    await expect(react16Versions(commitAt)).rejects.toThrow('No commit on main');
    expect(commitAt).toHaveBeenCalledTimes(1);
  });
});

describe('url paths', () => {
  it('cites legacy pages by file path and skips translations', () => {
    expect(legacyReactUrlPath('docs/docs/02-displaying-data.md')).toBe('docs/docs/02-displaying-data.md');
    expect(legacyReactUrlPath('docs/docs/02-displaying-data.zh-CN.md')).toBeNull();
    expect(legacyReactUrlPath('docs/docs/10-addons.ko-KR.md')).toBeNull();
  });

  it('maps react.dev files to their routes', () => {
    expect(reactDevUrlPath('src/content/reference/react/useState.md')).toBe('reference/react/useState');
    expect(reactDevUrlPath('src/content/learn/index.md')).toBe('learn');
  });
});

describe('reactAdapter.loadPages', () => {
  let dir: string;
  const write = async (path: string, content: string) => {
    await mkdir(dirname(join(dir, path)), { recursive: true });
    await writeFile(join(dir, path), content);
  };

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'react-docs-'));
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it('loads legacy Jekyll docs with GitHub anchors and no translations', async () => {
    const [source] = legacyReactVersions([tag('0.14.8')]);
    const body = '## Getting Started\n\nThe most basic thing you can do with a UI is display some data, and React keeps it in sync.';
    await write('docs/docs/02-displaying-data.md', `---\nid: displaying-data\ntitle: Displaying Data\npermalink: displaying-data.html\n---\n\n${body}`);
    await write('docs/docs/02-displaying-data.zh-CN.md', `---\ntitle: 显示数据\n---\n\n${body}`);
    await write('docs/tips/03-if-else-in-JSX.md', '---\ntitle: If-Else in JSX\n---\n\n`if-else` statements do not work inside JSX because JSX is just syntactic sugar for function calls.');

    const pages = await reactAdapter.loadPages(dir, source);

    expect(pages.map((p) => p.urlPath)).toEqual(['docs/docs/02-displaying-data.md', 'docs/tips/03-if-else-in-JSX.md']);
    expect(pages[0].chunks[0]).toMatchObject({ pageTitle: 'Displaying Data', section: 'Getting Started', anchor: 'getting-started' });
  });

  it('loads reactjs.org docs by permalink and skips pages without one', async () => {
    const source = (await react16Versions(async () => 'sha'))[8];
    await write('content/docs/hooks-intro.md', '---\ntitle: Introducing Hooks\npermalink: docs/hooks-intro.html\n---\n\n## Video Introduction\n\n*Hooks* are a new addition in React 16.8. They let you use state without writing a class.');
    await write('content/docs/nav.md', '---\ntitle: Nav\n---\n\nNavigation data that is not a published page of the docs site at all.');

    const pages = await reactAdapter.loadPages(dir, source);

    expect(pages.map((p) => p.urlPath)).toEqual(['docs/hooks-intro.html']);
    expect(pages[0].chunks[0]).toMatchObject({ section: 'Video Introduction', anchor: 'video-introduction' });
  });
});
