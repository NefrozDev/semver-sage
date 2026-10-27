import { latestPerMajor, latestPerMinor, ReleaseTag, remoteCommitFromLsRemote } from './git';

describe('remoteCommitFromLsRemote', () => {
  const A = 'a'.repeat(40);
  const B = 'b'.repeat(40);
  const C = 'c'.repeat(40);

  it('peels an annotated tag to its commit', () => {
    const out = `${A}\trefs/tags/v16.14.0\n${B}\trefs/tags/v16.14.0^{}\n`;
    expect(remoteCommitFromLsRemote(out, 'v16.14.0')).toBe(B);
  });

  it('takes a lightweight tag or a branch head as is', () => {
    expect(remoteCommitFromLsRemote(`${A}\trefs/tags/0.14.10\n`, '0.14.10')).toBe(A);
    expect(remoteCommitFromLsRemote(`${C}\trefs/heads/main\n`, 'main')).toBe(C);
  });

  it('ignores refs that only end with the same name', () => {
    const out = `${A}\trefs/heads/dependabot/main\n${C}\trefs/heads/main\n`;
    expect(remoteCommitFromLsRemote(out, 'main')).toBe(C);
    expect(remoteCommitFromLsRemote(`${A}\trefs/heads/dependabot/main\n`, 'main')).toBeNull();
  });

  it('returns null for an unknown ref or empty output', () => {
    expect(remoteCommitFromLsRemote('', 'v99.0.0')).toBeNull();
  });
});

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
