import { loadEnv } from '@semver-sage/server-core';

/** How Semver Sage signs in with the Synapse identity service. */
export interface AuthConfig {
  /** The identity service's issuer, e.g. https://auth.synapseengineering.dev/oidc. */
  issuer: string;
  clientId: string;
  clientSecret: string;
  /** Where people open Semver Sage: the callback and the sign-out return are built from it. */
  publicUrl: string;
  /** The Synapse account page, linked from the header. */
  accountUrl: string;
  sessionTtlDays: number;
  /** Cookies are Secure whenever the site is served over https. */
  secureCookies: boolean;
}

function withoutTrailingSlashes(url: string): string {
  let end = url.length;
  while (url[end - 1] === '/') end -= 1;
  return url.slice(0, end);
}

const str = (env: NodeJS.ProcessEnv, name: string, fallback: string) => env[name]?.trim() || fallback;

/** The defaults match the identity service's development clients file. */
export function getAuthConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  loadEnv();
  const issuer = withoutTrailingSlashes(str(env, 'OIDC_ISSUER', 'http://localhost:4300/oidc'));
  const publicUrl = withoutTrailingSlashes(str(env, 'PUBLIC_URL', 'http://localhost:4200'));
  const ttl = Number(env['SESSION_TTL_DAYS']);
  return {
    issuer,
    clientId: str(env, 'OIDC_CLIENT_ID', 'semver-sage'),
    clientSecret: str(env, 'OIDC_CLIENT_SECRET', 'semver-sage-development-secret'),
    publicUrl,
    // The account page sits next to the issuer: https://auth.example/oidc → https://auth.example/account.
    accountUrl: new URL('/account', issuer).href,
    sessionTtlDays: Number.isInteger(ttl) && ttl > 0 ? ttl : 30,
    secureCookies: publicUrl.startsWith('https://'),
  };
}
