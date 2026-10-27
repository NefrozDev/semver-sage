import { svelte4Slug, svelte5Slug, svelteSiteVersions } from './svelte';

describe('svelteSiteVersions', () => {
  it('takes Svelte 1 from the site history before 2.0.0 and Svelte 2 from the archived head, both on GitHub', async () => {
    const commitAt = vi.fn(async () => 'abc123');

    expect(await svelteSiteVersions(commitAt)).toEqual([
      {
        version: '1',
        repo: 'sveltejs/v2.svelte.dev',
        ref: 'abc123',
        paths: ['content/guide'],
        docsBaseUrl: 'https://github.com/sveltejs/v2.svelte.dev/blob/abc123/',
      },
      {
        version: '2',
        repo: 'sveltejs/v2.svelte.dev',
        ref: 'master',
        paths: ['content/guide'],
        docsBaseUrl: 'https://github.com/sveltejs/v2.svelte.dev/blob/master/',
      },
    ]);
    expect(commitAt).toHaveBeenCalledOnce();
    expect(commitAt).toHaveBeenCalledWith('2018-04-19');
  });
});

describe('Svelte anchors', () => {
  it('matches svelte.dev (5)', () => {
    expect(svelte5Slug('Deep state')).toBe('Deep-state');
    expect(svelte5Slug('$state.raw')).toBe('$state.raw');
  });

  it('matches v4.svelte.dev, prefixing sub-headings with their section', () => {
    expect(svelte4Slug('<script>', [])).toBe('script');
    expect(svelte4Slug('1. export creates a component prop', ['<script>'])).toBe(
      'script-1-export-creates-a-component-prop',
    );
    expect(svelte4Slug('3. $: marks a statement as reactive', ['<script>'])).toBe(
      'script-3-$-marks-a-statement-as-reactive',
    );
  });
});
