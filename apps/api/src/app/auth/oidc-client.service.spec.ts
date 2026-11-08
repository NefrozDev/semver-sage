import { ServiceUnavailableException } from '@nestjs/common';
import * as oidc from 'openid-client';
import { OidcClientService } from './oidc-client.service';

const ISSUER = 'http://localhost:4300/oidc';

/** The service against fixed metadata, without discovery over the network. */
class FixedOidcClient extends OidcClientService {
  protected override configuration(): Promise<oidc.Configuration> {
    const config = new oidc.Configuration(
      {
        issuer: ISSUER,
        authorization_endpoint: `${ISSUER}/auth`,
        token_endpoint: `${ISSUER}/token`,
        end_session_endpoint: `${ISSUER}/session/end`,
        jwks_uri: `${ISSUER}/jwks`,
      },
      'semver-sage',
      'secret',
    );
    // The local identity service is plain http.
    oidc.allowInsecureRequests(config);
    return Promise.resolve(config);
  }
}

describe('OidcClientService', () => {
  it('asks for the code flow with PKCE, back to the registered callback', async () => {
    const client = new FixedOidcClient();
    const checks = client.newChecks();

    const url = new URL(await client.authorizationUrl(checks));

    expect(url.origin + url.pathname).toBe(`${ISSUER}/auth`);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: 'semver-sage',
      response_type: 'code',
      redirect_uri: 'http://localhost:4200/api/auth/callback',
      scope: 'openid profile',
      state: checks.state,
      nonce: checks.nonce,
      code_challenge: await oidc.calculatePKCECodeChallenge(checks.codeVerifier),
      code_challenge_method: 'S256',
      ui_locales: 'en',
    });
  });

  it('draws new secrets for every sign-in', () => {
    const client = new FixedOidcClient();

    const first = client.newChecks();
    const second = client.newChecks();

    expect(first.state).not.toBe(second.state);
    expect(first.nonce).not.toBe(second.nonce);
    expect(first.codeVerifier).not.toBe(second.codeVerifier);
  });

  it('signs out at the identity service, then comes back home', async () => {
    const url = new URL(await new FixedOidcClient().signOutUrl());

    expect(url.origin + url.pathname).toBe(`${ISSUER}/session/end`);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: 'semver-sage',
      post_logout_redirect_uri: 'http://localhost:4200/',
    });
  });

  it('answers 503 while the identity service cannot be reached, and tries again on the next sign-in', async () => {
    class UnreachableOidcClient extends OidcClientService {
      attempts = 0;

      protected override discover(): Promise<oidc.Configuration> {
        this.attempts += 1;
        return Promise.reject(new Error('connect ECONNREFUSED'));
      }
    }
    const client = new UnreachableOidcClient();

    await expect(client.authorizationUrl(client.newChecks())).rejects.toThrow(ServiceUnavailableException);
    await expect(client.signOutUrl()).rejects.toThrow('The identity service cannot be reached: connect ECONNREFUSED');

    expect(client.attempts).toBe(2);
  });
});
