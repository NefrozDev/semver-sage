import { getAuthConfig } from './auth.config';

describe('getAuthConfig', () => {
  it("defaults to the identity service's development client", () => {
    expect(getAuthConfig({})).toEqual({
      issuer: 'http://localhost:4300/oidc',
      clientId: 'semver-sage',
      clientSecret: 'semver-sage-development-secret',
      publicUrl: 'http://localhost:4200',
      accountUrl: 'http://localhost:4300/account',
      sessionTtlDays: 30,
      secureCookies: false,
    });
  });

  it('reads production settings, trims trailing slashes and makes cookies Secure over https', () => {
    const config = getAuthConfig({
      OIDC_ISSUER: 'https://auth.synapseengineering.dev/oidc/',
      OIDC_CLIENT_SECRET: ' s3cret ',
      PUBLIC_URL: 'https://semversage.synapseengineering.dev//',
      SESSION_TTL_DAYS: '7',
    });

    expect(config).toMatchObject({
      issuer: 'https://auth.synapseengineering.dev/oidc',
      clientSecret: 's3cret',
      publicUrl: 'https://semversage.synapseengineering.dev',
      accountUrl: 'https://auth.synapseengineering.dev/account',
      sessionTtlDays: 7,
      secureCookies: true,
    });
  });

  it.each(['0', '-3', '1.5', 'week'])('ignores an invalid SESSION_TTL_DAYS (%s)', (ttl) => {
    expect(getAuthConfig({ SESSION_TTL_DAYS: ttl }).sessionTtlDays).toBe(30);
  });
});
