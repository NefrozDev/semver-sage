import { chunkHash, chunkMarkdown, cleanMarkdown, githubSlug, hexoSlug, kebabSlug, trimChar } from './chunker';

describe('cleanMarkdown', () => {
  it('reads the frontmatter title and drops scripts, hexo tags and HTML outside code', () => {
    const { title, body } = cleanMarkdown(
      [
        '---',
        'title: Computed Properties and Watchers',
        'type: guide',
        '---',
        '<script>',
        "const x = '#Watchers'",
        '</script>',
        '<p class="tip">Use the `<template>` tag wisely.</p>',
        '{% raw %}',
        '```html',
        '<div id="app">{{ msg }}</div>',
        '```',
        '{% endraw %}',
      ].join('\n'),
    );
    expect(title).toBe('Computed Properties and Watchers');
    expect(body).toBe(
      ['Use the `<template>` tag wisely.', '', '```html', '<div id="app">{{ msg }}</div>', '```'].join(
        '\n',
      ),
    );
  });

  it('turns VitePress containers and API toggles into labels', () => {
    const { body } = cleanMarkdown(
      ['::: warning Caution', 'Do not mutate.', ':::', '<div class="composition-api">', 'ref()', '</div>'].join(
        '\n',
      ),
    );
    expect(body).toBe('**Caution**\nDo not mutate.\n*(Composition API)*\nref()');
  });
});

describe('chunkMarkdown', () => {
  const para = (s: string) => `${s} `.repeat(20).trim();

  it('chunks by h2/h3 with heading trails and anchors', () => {
    const chunks = chunkMarkdown(
      [
        '# Computed Properties {#computed-properties}',
        para('intro text'),
        '## Basic Example {#basic-example}',
        para('basic text'),
        '### Getter Only',
        para('getter text'),
        '```js',
        '# not a heading',
        '```',
      ].join('\n\n'),
      { slugify: kebabSlug },
    );
    expect(chunks.map((c) => [c.section, c.anchor])).toEqual([
      ['Computed Properties', null],
      ['Basic Example', 'basic-example'],
      ['Basic Example > Getter Only', 'getter-only'],
    ]);
    expect(chunks.every((c) => c.pageTitle === 'Computed Properties')).toBe(true);
    expect(chunks[2].text).toContain('# not a heading');
  });

  it('can split on deeper headings, keeping the full trail', () => {
    const md = ['## Callback API', '### Class: Dir', '#### dir.read()', para('reads'), '##### Deep', para('more')].join(
      '\n\n',
    );
    const chunks = chunkMarkdown(md, { slugify: kebabSlug, splitDepth: 4 });
    expect(chunks.map((c) => c.section)).toEqual(['Callback API > Class: Dir > dir.read()']);
    expect(chunks[0].text).toContain('##### Deep');
  });

  it('splits long sections on paragraph boundaries without breaking code', () => {
    const code = ['```js', 'const a = 1', '', 'const b = 2', '```'].join('\n');
    const md = ['## Long', para('alpha'), code, para('beta'), para('gamma')].join('\n\n');
    const chunks = chunkMarkdown(md, { slugify: kebabSlug, maxChars: 250 });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.some((c) => c.text.includes(code))).toBe(true);
  });

  it('drops near-empty sections', () => {
    expect(chunkMarkdown('## Empty\n\n---\n\n## Also empty', { slugify: kebabSlug })).toEqual([]);
  });
});

describe('slugs and hashes', () => {
  it('reads react.dev MDX heading ids', () => {
    const md = `## Usage {/*usage*/}\n\n${'Call useState at the top level. '.repeat(4)}`;
    expect(chunkMarkdown(md, { slugify: kebabSlug })[0]).toMatchObject({ section: 'Usage', anchor: 'usage' });
  });

  it('matches the anchors each docs site generates', () => {
    expect(githubSlug('req.params')).toBe('reqparams');
    expect(githubSlug('Using `next.config.js`')).toBe('using-nextconfigjs');
    expect(kebabSlug('Computed Caching vs. Methods')).toBe('computed-caching-vs-methods');
    expect(hexoSlug('vm.$watch( expOrFn, callback, [options] )')).toBe('vm-watch-expOrFn-callback-options');
  });

  it('hashes whitespace-insensitively but path-sensitively', () => {
    const chunk = { pageTitle: 'T', section: 'S', anchor: null, text: 'a  b\nc' };
    expect(chunkHash('x.html', chunk)).toBe(chunkHash('x.html', { ...chunk, text: 'a b c' }));
    expect(chunkHash('x.html', chunk)).not.toBe(chunkHash('y.html', chunk));
  });
});

// Inputs that made the previous regexes backtrack (quadratic or worse); each must stay fast.
describe('pathological input', () => {
  const run = 50_000;

  it('trimChar strips runs on both ends only', () => {
    expect(trimChar('--a-b--', '-')).toBe('a-b');
    expect(trimChar('----', '-')).toBe('');
  });

  it('handles long runs of separators, hashes, colons and brackets quickly', () => {
    const started = performance.now();
    kebabSlug(`${'-'.repeat(run)}a`);
    hexoSlug(`a${' '.repeat(run)}!`);
    chunkMarkdown(
      [
        `## Title${' '.repeat(run)}x`,
        `## ${'#'.repeat(run)}x`,
        `## ${'['.repeat(run)}`,
        `## a {#${'a'.repeat(run)}`,
        `:::${' '.repeat(run)}x`,
        `---\ntitle: ${' '.repeat(run)}x\n---`,
      ].join('\n'),
      { slugify: kebabSlug },
    );
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it('still reads headings, closing hashes, custom and MDX ids', () => {
    const chunks = chunkMarkdown(
      `## Usage ##\n\n${'text '.repeat(20)}\n\n## Hooks {/*hooks*/}\n\n${'text '.repeat(20)}\n\n### C# {#csharp}\n\n${'text '.repeat(20)}`,
      { slugify: kebabSlug },
    );
    expect(chunks.map((c) => [c.section, c.anchor])).toEqual([
      ['Usage', 'usage'],
      ['Hooks', 'hooks'],
      ['Hooks > C#', 'csharp'],
    ]);
  });
});
