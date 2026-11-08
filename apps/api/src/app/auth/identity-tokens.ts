import { jwtVerify, type JWTVerifyGetKey } from 'jose';

/** The event the identity service sends when an account is deleted. */
export const ACCOUNT_DELETED_EVENT =
  'https://auth.synapseengineering.dev/events/account-deleted';
const BACKCHANNEL_LOGOUT_EVENT =
  'http://schemas.openid.net/event/backchannel-logout';

export interface TokenExpectations {
  /** The identity service's issuer, e.g. https://auth.synapseengineering.dev/oidc. */
  issuer: string;
  /** Semver Sage's client id: tokens for another app are refused. */
  audience: string;
}

export interface EndedSession {
  /** The account, when the token names it. */
  sub?: string;
  /** The identity session that ended, when the token names it. */
  sid?: string;
}

function hasEvent(events: unknown, name: string): boolean {
  return (
    typeof events === 'object' && events !== null && Object.keys(events).includes(name)
  );
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

/**
 * Checks a back-channel logout token (OpenID Connect Back-Channel Logout
 * 1.0): signed by the identity service for Semver Sage, recent, with the logout
 * event, naming a session or an account, and without a nonce.
 */
export async function verifyLogoutToken(
  token: string,
  keys: JWTVerifyGetKey,
  expected: TokenExpectations,
): Promise<EndedSession> {
  const { payload } = await jwtVerify(token, keys, {
    issuer: expected.issuer,
    audience: expected.audience,
    maxTokenAge: '10 minutes',
  });
  const ended: EndedSession = {
    sub: optionalString(payload.sub),
    sid: optionalString(payload['sid']),
  };
  if (
    !hasEvent(payload['events'], BACKCHANNEL_LOGOUT_EVENT) ||
    payload['nonce'] !== undefined ||
    (!ended.sub && !ended.sid)
  ) {
    throw new Error('Not a back-channel logout token.');
  }
  return ended;
}

/**
 * Checks an account deletion notice (a Security Event Token): signed by the
 * identity service for Semver Sage, typed secevent+jwt, with the deletion event.
 * Returns the deleted account's id.
 */
export async function verifyAccountDeletion(
  token: string,
  keys: JWTVerifyGetKey,
  expected: TokenExpectations,
): Promise<string> {
  const { payload } = await jwtVerify(token, keys, {
    issuer: expected.issuer,
    audience: expected.audience,
    typ: 'secevent+jwt',
    requiredClaims: ['sub', 'exp'],
  });
  const sub = optionalString(payload.sub);
  if (!sub || !hasEvent(payload['events'], ACCOUNT_DELETED_EVENT)) {
    throw new Error('Not an account deletion notice.');
  }
  return sub;
}
