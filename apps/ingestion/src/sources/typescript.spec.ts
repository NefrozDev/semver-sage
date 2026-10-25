import { tsconfigOptionPage } from './typescript';

describe('tsconfigOptionPage', () => {
  it('turns an option file into a titled section named after the option', () => {
    const md = '---\ndisplay: "Strict Null Checks"\noneline: "x"\n---\n\nWhen `strictNullChecks` is `false`...';
    expect(tsconfigOptionPage(md, 'packages/tsconfig-reference/copy/en/options/strictNullChecks.md')).toBe(
      '# TSConfig: Strict Null Checks\n\n## strictNullChecks\n\nWhen `strictNullChecks` is `false`...',
    );
  });
});
