import { minVersionFromRange, numToVersion, parseVersion, versionToNum } from './version';

describe('version encoding', () => {
  it('orders versions numerically, not lexically', () => {
    expect(versionToNum('10')).toBeGreaterThan(versionToNum('9.99.99'));
    expect(versionToNum('2.7')).toBeGreaterThan(versionToNum('2.6.14'));
  });

  it('round-trips', () => {
    for (const v of ['3', '2.7', '18.19.1', '14.0.1']) {
      expect(numToVersion(versionToNum(v))).toBe(v);
    }
  });

  it('parses loose inputs', () => {
    expect(parseVersion('v18.x')).toEqual({ major: 18, minor: 0, patch: 0 });
    expect(parseVersion(' v 2.7')).toEqual({ major: 2, minor: 7, patch: 0 });
    expect(parseVersion('nope')).toBeNull();
  });

  it('rejects long garbage in linear time', () => {
    const started = performance.now();
    expect(parseVersion(' '.repeat(100_000) + 'x')).toBeNull();
    expect(performance.now() - started).toBeLessThan(100);
  });

  it('derives the lowest version of an npm range', () => {
    expect(minVersionFromRange('^2.6.14')).toBe('2.6.14');
    expect(minVersionFromRange('>=18')).toBe('18');
    expect(minVersionFromRange('workspace:*')).toBeNull();
  });
});
