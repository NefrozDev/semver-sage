import { cleanNextMdx, nextUrlPath } from './nextjs';

describe('nextUrlPath', () => {
  it('drops ordering prefixes, extensions and index pages', () => {
    expect(nextUrlPath('docs/02-app/01-building-your-application/01-routing/03-linking-and-navigating.mdx')).toBe(
      'app/building-your-application/routing/linking-and-navigating',
    );
    expect(nextUrlPath('docs/01-app/01-getting-started/index.mdx')).toBe('app/getting-started');
  });
});

describe('cleanNextMdx', () => {
  const app = 'docs/02-app/01-building-your-application/page.mdx';

  it('skips generated pages-router copies', () => {
    expect(cleanNextMdx('---\ntitle: Redirecting\nsource: app/x\n---\n\nbody', 'docs/03-pages/a.mdx')).toBeNull();
  });

  it('keeps only the content for the router the page belongs to', () => {
    const md = 'Both\n<AppOnly>App text</AppOnly>\n<PagesOnly>Pages text</PagesOnly>';
    expect(cleanNextMdx(md, app)).toContain('App text');
    expect(cleanNextMdx(md, app)).not.toContain('Pages text');
    expect(cleanNextMdx(md, 'docs/03-pages/01-x/page.mdx')).not.toContain('App text');
  });

  it('keeps the TypeScript side of code switchers', () => {
    const md = [
      '```tsx filename="app/page.tsx" switcher',
      'export default function Page(): JSX.Element {}',
      '```',
      '',
      '```jsx filename="app/page.js" switcher',
      'export default function Page() {}',
      '```',
    ].join('\n');
    const out = cleanNextMdx(md, app) ?? '';
    expect(out).toContain('page.tsx');
    expect(out).not.toContain('page.js"');
  });
});
