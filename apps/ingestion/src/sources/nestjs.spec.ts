import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  cleanNestMarkdown,
  componentSnippets,
  nestHtmlToMarkdown,
  nestjsAdapter,
  nestSnapshotVersions,
  stripTags,
} from './nestjs';

describe('nestSnapshotVersions', () => {
  it('snapshots master just before each next major shipped, cited on GitHub at the commit', async () => {
    const commitAt = vi.fn(async (before: string) => `sha-${before}`);
    const versions = await nestSnapshotVersions(commitAt, [10, 11]);

    expect(versions.map((v) => `${v.version}@${v.ref}`)).toEqual([
      '4@sha-2018-05-13',
      '5@sha-2019-03-16',
      '6@sha-2020-03-13',
      '7@sha-2021-07-07',
      '8@sha-2022-07-08',
      '9@sha-2023-06-15',
    ]);
    expect(versions[2]).toMatchObject({
      repo: 'nestjs/docs.nestjs.com',
      paths: ['content'],
      // The source file is linked, the URL path stays the docs.nestjs.com route.
      docsBaseUrl: 'https://github.com/nestjs/docs.nestjs.com/blob/sha-2020-03-13/{source}',
    });
    expect(commitAt).toHaveBeenCalledTimes(6);
  });

  it('reads Nest 4 from the Angular page templates the docs had before markdown', async () => {
    const [nest4, nest5] = await nestSnapshotVersions(async (before) => before, []);
    expect(nest4.paths).toEqual(['src/app/homepage/pages']);
    expect(nest5.paths).toEqual(['content']);
  });

  it('skips majors that have their own docs branch, without looking them up', async () => {
    const commitAt = vi.fn(async (before: string) => `sha-${before}`);
    const versions = await nestSnapshotVersions(commitAt, [9, 10, 11]);

    expect(versions.map((v) => v.version)).toEqual(['4', '5', '6', '7', '8']);
    expect(commitAt).not.toHaveBeenCalledWith('2023-06-15');
    expect(commitAt).toHaveBeenCalledTimes(5);
  });
});

describe('cleanNestMarkdown', () => {
  it('promotes the first heading and keeps only the TypeScript sample', () => {
    const md = [
      '### Controllers',
      '',
      '#### Routing',
      '```typescript',
      '@@filename(cats.controller)',
      'export class CatsController {}',
      '@@switch',
      'export class CatsController { /* js */ }',
      '```',
    ].join('\n');
    expect(cleanNestMarkdown(md)).toBe(
      ['# Controllers', '', '#### Routing', '```typescript', '// cats.controller', 'export class CatsController {}', '```'].join(
        '\n',
      ),
    );
  });
});

const COMPONENT_TS = [
  "import { Component } from '@angular/core';",
  'export class InterceptorsComponent extends BasePageComponent {',
  '  get loggingInterceptor() {',
  '    return `',
  'export class LoggingInterceptor {',
  '  log() { console.log(\\`After \\${Date.now()}ms\\`); }',
  '}`;',
  '  }',
  '',
  '  get loggingInterceptorJs() {',
  '    return `',
  'export class LoggingInterceptor { /* js */ }`;',
  '  }',
  '}',
].join('\n');

const PAGE_HTML = `<div class="content">
  <h3>Interceptors</h3>
  <p>An interceptor implements the <code>NestInterceptor</code> interface &amp; is <strong>injectable</strong>.</p>
  <figure><img src="/assets/Interceptors_1.png" /></figure>
  <h4>Basics</h4>
  <ul>
    <li>bind <strong>extra logic</strong></li>
    <li>transform the <a routerLink="/guards">result</a></li>
  </ul>
  <span class="filename">{{ 'logging.interceptor' | extension: loggingT.isJsActive }}<app-tabs #loggingT></app-tabs></span>
  <pre [class.hide]="loggingT.isJsActive"><code class="language-typescript">{{ loggingInterceptor }}</code></pre>
  <pre [class.hide]="!loggingT.isJsActive"><code class="language-typescript">{{ loggingInterceptorJs }}</code></pre>
  <table><tr><td><code>@Get()</code></td><td>GET &lt;route&gt;</td></tr></table>
  <blockquote class="info"><strong>Hint</strong> Use them sparingly.</blockquote>
</div>`;

describe('componentSnippets', () => {
  it('reads the getters, unescaping the template literal', () => {
    const snippets = componentSnippets(COMPONENT_TS);
    expect([...snippets.keys()]).toEqual(['loggingInterceptor', 'loggingInterceptorJs']);
    expect(snippets.get('loggingInterceptor')).toBe(
      'export class LoggingInterceptor {\n  log() { console.log(`After ${Date.now()}ms`); }\n}',
    );
  });
});

describe('nestHtmlToMarkdown', () => {
  const markdown = nestHtmlToMarkdown(PAGE_HTML, componentSnippets(COMPONENT_TS));

  it('turns headings, inline markup, lists and tables into markdown', () => {
    expect(markdown).toContain('### Interceptors');
    expect(markdown).toContain('#### Basics');
    expect(markdown).toContain('An interceptor implements the `NestInterceptor` interface & is **injectable**.');
    expect(markdown).toContain('- bind **extra logic**');
    expect(markdown).toContain('- transform the result');
    expect(markdown).toContain('`@Get()` | GET <route>');
    expect(markdown).toContain('**Hint** Use them sparingly.');
    expect(markdown).not.toMatch(/<\/?(?:div|p|h\d|code|strong|ul|li|a|span|pre|table|tr|td|blockquote|figure|img)\b/);
  });

  it('fills code blocks from the component and drops their JavaScript copy', () => {
    expect(markdown).toContain('logging.interceptor.ts');
    expect(markdown).toContain(
      '```typescript\nexport class LoggingInterceptor {\n  log() { console.log(`After ${Date.now()}ms`); }\n}\n```',
    );
    expect(markdown).not.toContain('/* js */');
  });

  it('keeps unknown snippet references as they are', () => {
    expect(nestHtmlToMarkdown('<pre><code>{{ missing }}</code></pre>', new Map())).toBe('```\n{{ missing }}\n```');
  });
});

describe('nestjsAdapter.loadPages', () => {
  let dir: string;
  const write = async (path: string, content: string) => {
    await mkdir(dirname(join(dir, path)), { recursive: true });
    await writeFile(join(dir, path), content);
  };

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'nest-docs-'));
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it('reads Nest 4 page components under their docs.nestjs.com routes', async () => {
    const [nest4] = await nestSnapshotVersions(async () => 'abc', []);
    await write('src/app/homepage/pages/interceptors/interceptors.component.html', PAGE_HTML);
    await write('src/app/homepage/pages/interceptors/interceptors.component.ts', COMPONENT_TS);
    await write('src/app/homepage/pages/components/components.component.html', '<h3>Providers</h3><p>Almost everything is a provider: services, repositories, factories and helpers can be injected.</p>');
    await write('src/app/homepage/pages/components/components.component.ts', 'export class ComponentsComponent {}');

    const pages = await nestjsAdapter.loadPages(dir, nest4);

    expect(pages.map((p) => [p.urlPath, p.sourcePath])).toEqual([
      ['providers', 'src/app/homepage/pages/components/components.component.html'],
      ['interceptors', 'src/app/homepage/pages/interceptors/interceptors.component.html'],
    ]);
    expect(pages[1].chunks.map((c) => [c.pageTitle, c.section, c.anchor])).toContainEqual(['Interceptors', 'Basics', 'basics']);
  });

  it('uses the same routes for markdown majors cited on GitHub as for the current one', async () => {
    await write(
      'content/interceptors.md',
      '### Interceptors\n\n#### Basics\n\nEach interceptor implements the intercept() method, which takes the execution context and a call handler.',
    );
    await write(
      'content/components.md',
      '### Providers\n\nProviders are a fundamental concept in Nest: many of the basic Nest classes may be treated as providers.',
    );
    await write(
      'content/discover/who-uses.md',
      '### Who is using Nest?\n\nMany companies use Nest in production, from small startups to large enterprises worldwide.',
    );
    const source = { version: '11', repo: 'nestjs/docs.nestjs.com', ref: '11.0.0', paths: ['content'] };

    const onGithub = await nestjsAdapter.loadPages(dir, { ...source, docsBaseUrl: 'https://github.com/x/blob/11.0.0/{source}' });
    const onSite = await nestjsAdapter.loadPages(dir, { ...source, docsBaseUrl: 'https://docs.nestjs.com/' });

    expect(onGithub.map((p) => p.urlPath)).toEqual(['providers', 'interceptors']);
    expect(onSite.map((p) => p.urlPath)).toEqual(['providers', 'interceptors']);
  });
});

describe('stripTags', () => {
  it.each([
    ['<p class="x">Text <b>bold</b></p>', 'Text bold'],
    ['a < b and c', 'a < b and c'],
    ['open <tag without end', 'open <tag without end'],
    ['<<a>b>', 'b>'],
    ['', ''],
  ])('%j -> %j', (html, text) => {
    expect(stripTags(html)).toBe(text);
  });

  it('stays fast on many unclosed "<"', () => {
    const started = performance.now();
    stripTags('<'.repeat(200_000));
    expect(performance.now() - started).toBeLessThan(200);
  });
});
