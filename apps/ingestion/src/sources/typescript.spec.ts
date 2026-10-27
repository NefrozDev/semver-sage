import { handbookVersions, tsconfigOptionPage } from './typescript';

describe('handbookVersions', () => {
  it('snapshots the Handbook when 2.0 and 3.0 shipped, cited on GitHub at the commit', async () => {
    const commitAt = vi.fn(async (before: string) => `sha-${before}`);

    expect(await handbookVersions(commitAt)).toEqual([
      {
        version: '1',
        repo: 'microsoft/TypeScript-Handbook',
        ref: 'sha-2016-09-22',
        paths: ['pages'],
        docsBaseUrl: 'https://github.com/microsoft/TypeScript-Handbook/blob/sha-2016-09-22/',
      },
      expect.objectContaining({ version: '2', ref: 'sha-2018-07-30' }),
    ]);
    expect(commitAt.mock.calls).toEqual([['2016-09-22'], ['2018-07-30']]);
  });
});

describe('tsconfigOptionPage', () => {
  it('turns an option file into a titled section named after the option', () => {
    const md = '---\ndisplay: "Strict Null Checks"\noneline: "x"\n---\n\nWhen `strictNullChecks` is `false`...';
    expect(tsconfigOptionPage(md, 'packages/tsconfig-reference/copy/en/options/strictNullChecks.md')).toBe(
      '# TSConfig: Strict Null Checks\n\n## strictNullChecks\n\nWhen `strictNullChecks` is `false`...',
    );
  });
});
