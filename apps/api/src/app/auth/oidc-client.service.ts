import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createRemoteJWKSet, type JWTVerifyGetKey } from 'jose';
import * as oidc from 'openid-client';
import { getAuthConfig, type AuthConfig } from './auth.config';
import { type EndedSession, verifyAccountDeletion, verifyLogoutToken } from './identity-tokens';

/** What Semver Sage keeps of a person from the identity service's ID token. */
export interface IdentityClaims {
  sub: string;
  username: string;
  /** The identity session, for back-channel logouts. */
  sid: string | null;
}

/** The secrets of one sign-in, kept in a short-lived cookie until the callback. */
export interface SignInChecks {
  state: string;
  nonce: string;
  codeVerifier: string;
}

function requiredClaim(claims: Record<string, unknown>, name: string): string {
  const value = claims[name];
  if (typeof value !== 'string' || !value) throw new Error(`The ID token has no ${name}.`);
  return value;
}

/**
 * Semver Sage as a client of the Synapse identity service (OpenID Connect): the code flow with
 * PKCE, the sign-out address, and the checks of what the service sends back (logout tokens,
 * deletion notices). Discovery is lazy and retried, so the API starts while the service is down.
 */
@Injectable()
export class OidcClientService {
  readonly config: AuthConfig = getAuthConfig();
  private discovery?: Promise<oidc.Configuration>;
  private keys?: JWTVerifyGetKey;

  private get redirectUri() {
    return `${this.config.publicUrl}/api/auth/callback`;
  }

  newChecks(): SignInChecks {
    return {
      state: oidc.randomState(),
      nonce: oidc.randomNonce(),
      codeVerifier: oidc.randomPKCECodeVerifier(),
    };
  }

  /** Where to send the browser to sign in. */
  async authorizationUrl(checks: SignInChecks): Promise<string> {
    const config = await this.configuration();
    return oidc.buildAuthorizationUrl(config, {
      redirect_uri: this.redirectUri,
      scope: 'openid profile',
      state: checks.state,
      nonce: checks.nonce,
      code_challenge: await oidc.calculatePKCECodeChallenge(checks.codeVerifier),
      code_challenge_method: 'S256',
      ui_locales: 'en',
    }).href;
  }

  /** Exchanges the code, checking state, nonce, PKCE and the ID token's signature, issuer and audience. */
  async signIn(query: Record<string, string>, checks: SignInChecks): Promise<IdentityClaims> {
    const config = await this.configuration();
    // Rebuilt from the registered address, never from the request's host.
    const callback = new URL(this.redirectUri);
    callback.search = new URLSearchParams(query).toString();
    const tokens = await oidc.authorizationCodeGrant(config, callback, {
      pkceCodeVerifier: checks.codeVerifier,
      expectedState: checks.state,
      expectedNonce: checks.nonce,
      idTokenExpected: true,
    });
    const claims = tokens.claims() as Record<string, unknown> | undefined;
    if (!claims) throw new Error('The identity service sent no ID token.');
    return {
      sub: requiredClaim(claims, 'sub'),
      username: requiredClaim(claims, 'preferred_username'),
      sid: typeof claims['sid'] === 'string' && claims['sid'] ? claims['sid'] : null,
    };
  }

  /** Where to send the browser once Semver Sage's session is gone: every app signs out. */
  async signOutUrl(): Promise<string> {
    const config = await this.configuration();
    return oidc.buildEndSessionUrl(config, {
      client_id: this.config.clientId,
      post_logout_redirect_uri: `${this.config.publicUrl}/`,
    }).href;
  }

  async verifyLogoutToken(token: string): Promise<EndedSession> {
    return verifyLogoutToken(token, await this.keySet(), this.expectations());
  }

  /** The id of the account the notice says was deleted. */
  async verifyAccountDeletion(token: string): Promise<string> {
    return verifyAccountDeletion(token, await this.keySet(), this.expectations());
  }

  private expectations() {
    return { issuer: this.config.issuer, audience: this.config.clientId };
  }

  protected async keySet(): Promise<JWTVerifyGetKey> {
    if (!this.keys) {
      const jwksUri = (await this.configuration()).serverMetadata().jwks_uri;
      if (!jwksUri) throw new Error('The identity service publishes no keys.');
      // Cached, and fetched again when a token names an unknown key.
      this.keys = createRemoteJWKSet(new URL(jwksUri));
    }
    return this.keys;
  }

  protected configuration(): Promise<oidc.Configuration> {
    this.discovery ??= this.discover().catch((error: unknown) => {
      // Down for now: the next sign-in tries again.
      this.discovery = undefined;
      throw new ServiceUnavailableException(
        `The identity service cannot be reached: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    });
    return this.discovery;
  }

  protected discover(): Promise<oidc.Configuration> {
    const issuer = new URL(this.config.issuer);
    return oidc.discovery(
      issuer,
      this.config.clientId,
      undefined,
      oidc.ClientSecretBasic(this.config.clientSecret),
      // Plain http is only for a local identity service.
      issuer.protocol === 'http:' ? { execute: [oidc.allowInsecureRequests] } : undefined,
    );
  }
}
