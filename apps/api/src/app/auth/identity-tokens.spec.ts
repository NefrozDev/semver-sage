import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWTVerifyGetKey,
  SignJWT,
  type CryptoKey,
} from 'jose';
import {
  ACCOUNT_DELETED_EVENT,
  verifyAccountDeletion,
  verifyLogoutToken,
} from './identity-tokens';

const ISSUER = 'https://auth.example/oidc';
const expected = { issuer: ISSUER, audience: 'semver-sage' };
const LOGOUT_EVENTS = {
  'http://schemas.openid.net/event/backchannel-logout': {},
};

describe('identity tokens', () => {
  let privateKey: CryptoKey;
  let otherKey: CryptoKey;
  let keys: JWTVerifyGetKey;

  beforeAll(async () => {
    const pair = await generateKeyPair('RS256');
    privateKey = pair.privateKey;
    otherKey = (await generateKeyPair('RS256')).privateKey;
    keys = createLocalJWKSet({
      keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'RS256' }],
    });
  });

  function token(
    claims: Record<string, unknown>,
    options: { typ?: string; key?: CryptoKey; audience?: string } = {},
  ): Promise<string> {
    return new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid: 'k1', typ: options.typ })
      .setIssuer(ISSUER)
      .setAudience(options.audience ?? 'semver-sage')
      .setIssuedAt()
      .setExpirationTime('10m')
      .setJti('j1')
      .sign(options.key ?? privateKey);
  }

  describe('verifyLogoutToken', () => {
    it('returns the account and session a valid logout token names', async () => {
      const jwt = await token({ sub: 'u1', sid: 's1', events: LOGOUT_EVENTS });

      await expect(verifyLogoutToken(jwt, keys, expected)).resolves.toEqual({
        sub: 'u1',
        sid: 's1',
      });
    });

    it.each([
      [
        'for another app',
        { sub: 'u1', events: LOGOUT_EVENTS },
        { audience: 'erudi' },
      ],
      [
        'signed by someone else',
        { sub: 'u1', events: LOGOUT_EVENTS },
        { key: undefined, other: true },
      ],
      ['without the logout event', { sub: 'u1', events: {} }, {}],
      [
        'with a nonce, as an ID token has',
        { sub: 'u1', nonce: 'n', events: LOGOUT_EVENTS },
        {},
      ],
      ['naming no account nor session', { events: LOGOUT_EVENTS }, {}],
    ])('refuses a token %s', async (_case, claims, options) => {
      const jwt = await token(claims, {
        audience: (options as { audience?: string }).audience,
        key: (options as { other?: boolean }).other ? otherKey : undefined,
      });

      await expect(verifyLogoutToken(jwt, keys, expected)).rejects.toThrow();
    });
  });

  describe('verifyAccountDeletion', () => {
    it('returns the deleted account of a valid notice', async () => {
      const jwt = await token(
        { sub: 'u1', events: { [ACCOUNT_DELETED_EVENT]: {} } },
        { typ: 'secevent+jwt' },
      );

      await expect(verifyAccountDeletion(jwt, keys, expected)).resolves.toBe(
        'u1',
      );
    });

    it('refuses a logout token, an untyped notice or a notice for another app', async () => {
      const logout = await token(
        { sub: 'u1', events: LOGOUT_EVENTS },
        { typ: 'secevent+jwt' },
      );
      const untyped = await token({
        sub: 'u1',
        events: { [ACCOUNT_DELETED_EVENT]: {} },
      });
      const otherApp = await token(
        { sub: 'u1', events: { [ACCOUNT_DELETED_EVENT]: {} } },
        { typ: 'secevent+jwt', audience: 'erudi' },
      );

      for (const jwt of [logout, untyped, otherApp]) {
        await expect(
          verifyAccountDeletion(jwt, keys, expected),
        ).rejects.toThrow();
      }
    });
  });
});
