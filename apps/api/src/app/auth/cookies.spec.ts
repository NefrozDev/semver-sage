import { readCookie } from './cookies';

describe('readCookie', () => {
  it('finds a cookie among others and decodes it', () => {
    const header = 'theme=dark; semver_sage_sign_in=%7B%22state%22%3A%22s%22%7D;other=1';

    expect(readCookie(header, 'semver_sage_sign_in')).toBe('{"state":"s"}');
    expect(readCookie(header, 'other')).toBe('1');
  });

  it('matches the whole name only', () => {
    expect(readCookie('xsemver_sage_session=a; semver_sage_session_old=b', 'semver_sage_session')).toBeUndefined();
  });

  it('keeps "=" inside a value', () => {
    expect(readCookie('t=abc==', 't')).toBe('abc==');
  });

  it.each([undefined, '', 'no-equals-sign', 't=%E0%A4%A'])('treats %j as missing', (header) => {
    expect(readCookie(header, 't')).toBeUndefined();
  });
});
