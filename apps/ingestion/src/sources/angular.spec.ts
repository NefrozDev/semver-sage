import { cleanAngularMarkdown, parseAdevRoutes } from './angular';

describe('cleanAngularMarkdown', () => {
  it('turns inline code tags into fences and decodes entities', () => {
    const out = cleanAngularMarkdown('<code-example language="html">\n&lt;input [formControl]="name"&gt;\n</code-example>');
    expect(out).toContain('```html\n<input [formControl]="name">\n```');
  });

  it('drops examples that only reference files, but not multi-file wrappers by mistake', () => {
    const md = [
      '{@a setup}',
      '<code-example path="forms/src/app/app.component.ts" region="x"></code-example>',
      '<docs-code-multifile path="a.ts">',
      '<docs-code path="a.ts" />',
      '</docs-code-multifile>',
      '<docs-code language="ts">',
      'const count = signal(0);',
      '</docs-code>',
    ].join('\n');
    const out = cleanAngularMarkdown(md);
    expect(out).not.toContain('{@a');
    expect(out).not.toContain('region="x"');
    expect(out).toContain('<docs-code-multifile');
    expect(out).toContain('```ts\nconst count = signal(0);\n```');
  });
});

describe('parseAdevRoutes', () => {
  it('maps content files to their angular.dev routes', () => {
    const nav = `{
        label: 'What is Angular?',
        path: 'overview',
        contentPath: 'introduction/what-is-angular',
      },
      { label: 'Overview', path: 'guide/signals', contentPath: 'guide/signals/overview' }`;
    const routes = parseAdevRoutes(nav);
    expect(routes.get('introduction/what-is-angular')).toBe('overview');
    expect(routes.get('guide/signals/overview')).toBe('guide/signals');
  });
});
