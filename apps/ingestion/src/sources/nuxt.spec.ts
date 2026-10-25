import { cleanNuxtMdc } from './nuxt';

describe('cleanNuxtMdc', () => {
  it('turns callouts into labels and drops inline components', () => {
    const md = [
      '::note',
      'Call it in setup.',
      '::',
      ':read-more{to="/docs/guide"}',
      '::tip{to="/docs/x"}',
      'Use createUseFetch.',
      '::',
      '```ts',
      '::not-mdc-inside-code',
      '```',
    ].join('\n');
    expect(cleanNuxtMdc(md)).toBe(
      ['**Note**', 'Call it in setup.', '**Tip**', 'Use createUseFetch.', '```ts', '::not-mdc-inside-code', '```'].join(
        '\n',
      ),
    );
  });
});
