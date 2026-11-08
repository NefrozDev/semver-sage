import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Logger,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { AuthSession } from '@semver-sage/types';
import type { CookieOptions, Request, Response } from 'express';
import { readCookie } from './cookies';
import { OidcClientService, type SignInChecks } from './oidc-client.service';
import { SessionsService } from './sessions.service';

export const SESSION_COOKIE = 'semver_sage_session';
export const SIGN_IN_COOKIE = 'semver_sage_sign_in';
const SIGN_IN_COOKIE_MS = 10 * 60 * 1000;

interface PendingSignIn extends SignInChecks {
  returnTo: string;
}

/** A path of this site to come back to, never another site (open redirect). */
export function safeReturnPath(value: unknown): string {
  return typeof value === 'string' &&
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.startsWith('/\\') &&
    !value.startsWith('/api/')
    ? value
    : '/';
}

function readPendingSignIn(value: string | undefined): PendingSignIn | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<PendingSignIn>;
    return typeof parsed.state === 'string' &&
      typeof parsed.nonce === 'string' &&
      typeof parsed.codeVerifier === 'string'
      ? {
          state: parsed.state,
          nonce: parsed.nonce,
          codeVerifier: parsed.codeVerifier,
          returnTo: safeReturnPath(parsed.returnTo),
        }
      : null;
  } catch {
    return null;
  }
}

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : 'unknown error');

/**
 * Signing in goes through the Synapse identity service (OpenID Connect): the account shared by
 * every Synapse Engineering app. Semver Sage then keeps its own session, only to show who is
 * signed in: asking questions never needs an account.
 */
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  private readonly sessionCookie: CookieOptions;
  private readonly signInCookie: CookieOptions;

  constructor(
    private readonly identity: OidcClientService,
    private readonly sessions: SessionsService,
  ) {
    const secure = identity.config.secureCookies;
    this.sessionCookie = { httpOnly: true, path: '/api', sameSite: 'lax', secure };
    this.signInCookie = { httpOnly: true, path: '/api/auth', sameSite: 'lax', secure };
  }

  /** Sends the browser to the identity service, then back to `returnTo`. */
  @Get('login')
  @UseGuards(ThrottlerGuard)
  async login(@Query('returnTo') returnTo: unknown, @Res() res: Response): Promise<void> {
    const checks = this.identity.newChecks();
    let url: string;
    try {
      url = await this.identity.authorizationUrl(checks);
    } catch (error) {
      this.logger.warn(`Sign-in unavailable: ${errorMessage(error)}`);
      res.redirect(303, '/?signIn=failed');
      return;
    }
    const pending: PendingSignIn = { ...checks, returnTo: safeReturnPath(returnTo) };
    res.cookie(SIGN_IN_COOKIE, JSON.stringify(pending), { ...this.signInCookie, maxAge: SIGN_IN_COOKIE_MS });
    res.redirect(303, url);
  }

  /**
   * Back from the identity service. Without this browser's pending sign-in, or when the person
   * went back without signing in, the page says so; otherwise Semver Sage's session opens.
   */
  @Get('callback')
  async callback(@Query() query: Record<string, string>, @Req() req: Request, @Res() res: Response): Promise<void> {
    const pending = readPendingSignIn(readCookie(req.headers.cookie, SIGN_IN_COOKIE));
    res.clearCookie(SIGN_IN_COOKIE, this.signInCookie);
    if (!pending || typeof query['code'] !== 'string') {
      res.redirect(303, '/?signIn=cancelled');
      return;
    }
    try {
      const claims = await this.identity.signIn(query, pending);
      const session = await this.sessions.open({ sub: claims.sub, username: claims.username }, claims.sid);
      res.cookie(SESSION_COOKIE, session.token, { ...this.sessionCookie, expires: session.expiresAt });
      res.redirect(303, pending.returnTo);
    } catch (error) {
      this.logger.warn(`Sign-in failed: ${errorMessage(error)}`);
      res.redirect(303, '/?signIn=failed');
    }
  }

  /** Who is signed in, if anyone: always 200, so anonymous visitors see no error. */
  @Get('session')
  async session(@Req() req: Request): Promise<AuthSession> {
    const user = await this.sessions.find(readCookie(req.headers.cookie, SESSION_COOKIE));
    return { username: user?.username ?? null, accountUrl: this.identity.config.accountUrl };
  }

  /**
   * Ends Semver Sage's session and answers where to send the browser next: the identity service,
   * which signs out of every Synapse app.
   */
  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<{ redirectTo: string }> {
    this.assertFromThisSite(req);
    await this.sessions.close(readCookie(req.headers.cookie, SESSION_COOKIE));
    res.clearCookie(SESSION_COOKIE, this.sessionCookie);
    const redirectTo = await this.identity.signOutUrl().catch(() => '/');
    return { redirectTo };
  }

  /** Called by the identity service, not by browsers, when a session ends anywhere (Back-Channel Logout). */
  @Post('backchannel-logout')
  @HttpCode(200)
  async backchannelLogout(@Body() body: unknown): Promise<void> {
    const token = (body as Record<string, unknown> | undefined)?.['logout_token'];
    if (typeof token !== 'string' || !token) throw new BadRequestException('logout_token is required');
    const ended = await this.identity.verifyLogoutToken(token).catch(() => {
      throw new BadRequestException('Invalid logout token');
    });
    await this.sessions.end(ended);
  }

  /**
   * Called by the identity service when an account is deleted. The body is a signed notice
   * (application/secevent+jwt), read as text (main.ts).
   */
  @Post('account-deleted')
  @HttpCode(204)
  async accountDeleted(@Body() token: unknown): Promise<void> {
    if (typeof token !== 'string' || !token) throw new BadRequestException('A signed notice is required');
    const sub = await this.identity.verifyAccountDeletion(token).catch(() => {
      throw new BadRequestException('Invalid deletion notice');
    });
    await this.sessions.forget(sub);
    this.logger.log(`Account ${sub} deleted at the identity service.`);
  }

  /** Cross-site request forgery: another site cannot sign people out. */
  private assertFromThisSite(req: Request): void {
    const expected = new URL(this.identity.config.publicUrl).origin;
    const source = req.headers.origin ?? req.headers.referer;
    let origin: string | null = null;
    try {
      origin = source ? new URL(source).origin : null;
    } catch {
      origin = null;
    }
    if (origin !== expected) throw new ForbiddenException('Not from this site');
  }
}
