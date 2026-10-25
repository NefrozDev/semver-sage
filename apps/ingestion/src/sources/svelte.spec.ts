import { svelte4Slug, svelte5Slug } from './svelte';

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
