import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanNextMdx, nextjsAdapter, nextUrlPath, readmePath } from './nextjs';

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

describe('readmePath', () => {
  it('follows the README through its renames and the move into the monorepo', () => {
    expect([1, 2, 6, 7, 8].map(readmePath)).toEqual([
      'README.md',
      'readme.md',
      'readme.md',
      'README.md',
      'packages/next/README.md',
    ]);
  });
});

describe('nextjsAdapter.loadPages (README majors)', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'next-readme-'));
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it('reads the README as one "Next.js" page with a stable URL path and GitHub anchors', async () => {
    const readme = [
      '[![Next.js](https://example.com/logo.png)](https://nextjs.org)',
      '',
      '## How to use',
      '',
      '#### With `<Link>`',
      '',
      'Client-side transitions between routes can be enabled via a `<Link>` component.',
    ].join('\n');
    await writeFile(join(dir, 'readme.md'), readme);
    const source = {
      version: '5',
      repo: 'vercel/next.js',
      ref: '5.1.0',
      paths: ['readme.md'],
      docsBaseUrl: 'https://github.com/vercel/next.js/blob/5.1.0/{source}',
    };

    const [page, ...others] = await nextjsAdapter.loadPages(dir, source);

    expect(others).toEqual([]);
    expect(page.urlPath).toBe('readme');
    expect(page.chunks.map((c) => [c.pageTitle, c.section, c.anchor])).toContainEqual([
      'Next.js',
      'How to use > With <Link>',
      'with-link',
    ]);
  });
});
