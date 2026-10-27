import { latestPerMajor, latestPerMinor, ReleaseTag } from './git';

const tag = (version: string): ReleaseTag => {
  const [major, minor, patch] = version.split('.').map(Number);
  return { tag: `v${version}`, major, minor, patch };
};
const TAGS = ['0.14.8', '0.14.2', '0.3.3', '15.6.1', '15.6.2', '15.7.0', '15.10.0', '16.0.0'].map(tag);

describe('latestPerMinor', () => {
  it('keeps the newest patch of each minor line, sorted numerically (15.10 after 15.7)', () => {
    expect(latestPerMinor(TAGS).map((t) => t.tag)).toEqual([
      'v0.3.3',
      'v0.14.8',
      'v15.6.2',
      'v15.7.0',
      'v15.10.0',
      'v16.0.0',
    ]);
  });

  it('applies the filter before picking', () => {
    expect(latestPerMinor(TAGS, (t) => t.major === 15 && t.minor <= 6).map((t) => t.tag)).toEqual(['v15.6.2']);
  });
});

describe('latestPerMajor', () => {
  it('keeps the newest release of each major', () => {
    expect(latestPerMajor(TAGS).map((t) => t.tag)).toEqual(['v0.14.8', 'v15.10.0', 'v16.0.0']);
  });
});
