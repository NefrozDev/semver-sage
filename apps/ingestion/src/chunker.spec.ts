import { chunkHash, chunkMarkdown, cleanMarkdown, hexoSlug, kebabSlug } from './chunker';

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
  it('matches the anchors each docs site generates', () => {
    expect(kebabSlug('Computed Caching vs. Methods')).toBe('computed-caching-vs-methods');
    expect(hexoSlug('vm.$watch( expOrFn, callback, [options] )')).toBe('vm-watch-expOrFn-callback-options');
  });

  it('hashes whitespace-insensitively but path-sensitively', () => {
    const chunk = { pageTitle: 'T', section: 'S', anchor: null, text: 'a  b\nc' };
    expect(chunkHash('x.html', chunk)).toBe(chunkHash('x.html', { ...chunk, text: 'a b c' }));
    expect(chunkHash('x.html', chunk)).not.toBe(chunkHash('y.html', chunk));
  });
});
