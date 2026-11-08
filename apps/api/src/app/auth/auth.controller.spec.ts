import { BadRequestException, ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { getAuthConfig } from './auth.config';
import { AuthController, safeReturnPath, SESSION_COOKIE, SIGN_IN_COOKIE } from './auth.controller';
import type { OidcClientService } from './oidc-client.service';
import type { SessionsService } from './sessions.service';

const CHECKS = { state: 'st', nonce: 'no', codeVerifier: 'cv' };
const pendingCookie = (value: object) => `${SIGN_IN_COOKIE}=${encodeURIComponent(JSON.stringify(value))}`;

function fakeResponse() {
  return {
    cookie: vi.fn(),
    clearCookie: vi.fn(),
    redirect: vi.fn(),
  };
}

const request = (headers: Record<string, string> = {}) => ({ headers }) as unknown as Request;

describe('safeReturnPath', () => {
  it.each(['/', '/?q=1', '/some/page'])('keeps %s', (path) => {
    expect(safeReturnPath(path)).toBe(path);
  });

  it.each([undefined, 42, '', 'https://evil.example', '//evil.example', '/\\evil.example', '/api/auth/logout'])(
    'falls back to / for %j',
    (path) => {
      expect(safeReturnPath(path)).toBe('/');
    },
  );
});

describe('AuthController', () => {
  const config = getAuthConfig({});
  const identity = {
    config,
    newChecks: vi.fn(),
    authorizationUrl: vi.fn(),
    signIn: vi.fn(),
    signOutUrl: vi.fn(),
    verifyLogoutToken: vi.fn(),
    verifyAccountDeletion: vi.fn(),
  };
  const sessions = {
    open: vi.fn(),
    find: vi.fn(),
    close: vi.fn(),
    end: vi.fn(),
    forget: vi.fn(),
  };
  const controller = new AuthController(
    identity as unknown as OidcClientService,
    sessions as unknown as SessionsService,
  );
  let res: ReturnType<typeof fakeResponse>;

  beforeEach(() => {
    vi.resetAllMocks();
    res = fakeResponse();
    identity.newChecks.mockReturnValue(CHECKS);
    identity.authorizationUrl.mockResolvedValue('http://localhost:4300/oidc/auth?client_id=semver-sage');
    identity.signOutUrl.mockResolvedValue('http://localhost:4300/oidc/session/end?client_id=semver-sage');
    sessions.open.mockResolvedValue({ token: 'tok', expiresAt: new Date('2026-12-08T12:00:00Z') });
  });

  describe('login', () => {
    it('keeps the checks and the return path in a short-lived cookie, then goes to the identity service', async () => {
      await controller.login('/?q=filters', res as unknown as Response);

      expect(identity.authorizationUrl).toHaveBeenCalledExactlyOnceWith(CHECKS);
      expect(res.cookie).toHaveBeenCalledExactlyOnceWith(
        SIGN_IN_COOKIE,
        JSON.stringify({ ...CHECKS, returnTo: '/?q=filters' }),
        { httpOnly: true, path: '/api/auth', sameSite: 'lax', secure: false, maxAge: 600_000 },
      );
      expect(res.redirect).toHaveBeenCalledExactlyOnceWith(303, 'http://localhost:4300/oidc/auth?client_id=semver-sage');
    });

    it('never returns to another site', async () => {
      await controller.login('https://evil.example', res as unknown as Response);

      expect(JSON.parse(res.cookie.mock.calls[0][1])).toMatchObject({ returnTo: '/' });
    });

    it('comes back to the page with a notice when the identity service is down', async () => {
      identity.authorizationUrl.mockRejectedValue(new ServiceUnavailableException('down'));

      await controller.login('/', res as unknown as Response);

      expect(res.cookie).not.toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledExactlyOnceWith(303, '/?signIn=failed');
    });
  });

  describe('callback', () => {
    const pending = { ...CHECKS, returnTo: '/?q=filters' };

    it('opens a session from the ID token and returns where the sign-in started', async () => {
      identity.signIn.mockResolvedValue({ sub: 'u1', username: 'ada', sid: 'sid-1' });

      await controller.callback(
        { code: 'c', state: 'st' },
        request({ cookie: `theme=dark; ${pendingCookie(pending)}` }),
        res as unknown as Response,
      );

      expect(identity.signIn).toHaveBeenCalledExactlyOnceWith({ code: 'c', state: 'st' }, pending);
      expect(sessions.open).toHaveBeenCalledExactlyOnceWith({ sub: 'u1', username: 'ada' }, 'sid-1');
      expect(res.clearCookie).toHaveBeenCalledExactlyOnceWith(SIGN_IN_COOKIE, expect.objectContaining({ path: '/api/auth' }));
      expect(res.cookie).toHaveBeenCalledExactlyOnceWith(SESSION_COOKIE, 'tok', {
        httpOnly: true,
        path: '/api',
        sameSite: 'lax',
        secure: false,
        expires: new Date('2026-12-08T12:00:00Z'),
      });
      expect(res.redirect).toHaveBeenCalledExactlyOnceWith(303, '/?q=filters');
    });

    it.each([
      ['without the pending sign-in cookie', { code: 'c' }, undefined],
      ['with a tampered cookie', { code: 'c' }, `${SIGN_IN_COOKIE}=not-json`],
      ['when the person cancelled (no code)', { error: 'access_denied' }, pendingCookie(pending)],
    ])('says the sign-in was cancelled %s', async (_case, query, cookie) => {
      await controller.callback(query, request(cookie ? { cookie } : {}), res as unknown as Response);

      expect(identity.signIn).not.toHaveBeenCalled();
      expect(sessions.open).not.toHaveBeenCalled();
      expect(res.clearCookie).toHaveBeenCalledTimes(1);
      expect(res.redirect).toHaveBeenCalledExactlyOnceWith(303, '/?signIn=cancelled');
    });

    it('opens no session when the identity service refuses the code', async () => {
      identity.signIn.mockRejectedValue(new Error('state mismatch'));

      await controller.callback({ code: 'c' }, request({ cookie: pendingCookie(pending) }), res as unknown as Response);

      expect(sessions.open).not.toHaveBeenCalled();
      expect(res.cookie).not.toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledExactlyOnceWith(303, '/?signIn=failed');
    });
  });

  describe('session', () => {
    it('names the signed-in person and links their account', async () => {
      sessions.find.mockResolvedValue({ sub: 'u1', username: 'ada' });

      await expect(controller.session(request({ cookie: `${SESSION_COOKIE}=tok` }))).resolves.toEqual({
        username: 'ada',
        accountUrl: 'http://localhost:4300/account',
      });
      expect(sessions.find).toHaveBeenCalledExactlyOnceWith('tok');
    });

    it('answers with no one when nobody is signed in', async () => {
      sessions.find.mockResolvedValue(null);

      await expect(controller.session(request())).resolves.toEqual({
        username: null,
        accountUrl: 'http://localhost:4300/account',
      });
      expect(sessions.find).toHaveBeenCalledExactlyOnceWith(undefined);
    });
  });

  describe('logout', () => {
    it('closes the session, clears its cookie and sends the browser to the identity sign-out', async () => {
      const result = await controller.logout(
        request({ origin: 'http://localhost:4200', cookie: `${SESSION_COOKIE}=tok` }),
        res as unknown as Response,
      );

      expect(sessions.close).toHaveBeenCalledExactlyOnceWith('tok');
      expect(res.clearCookie).toHaveBeenCalledExactlyOnceWith(SESSION_COOKIE, expect.objectContaining({ path: '/api' }));
      expect(result).toEqual({ redirectTo: 'http://localhost:4300/oidc/session/end?client_id=semver-sage' });
    });

    it('accepts the Referer when there is no Origin', async () => {
      await controller.logout(request({ referer: 'http://localhost:4200/?q=1' }), res as unknown as Response);

      expect(sessions.close).toHaveBeenCalledTimes(1);
    });

    it('still signs out here when the identity service is down', async () => {
      identity.signOutUrl.mockRejectedValue(new ServiceUnavailableException('down'));

      await expect(
        controller.logout(request({ origin: 'http://localhost:4200' }), res as unknown as Response),
      ).resolves.toEqual({ redirectTo: '/' });
      expect(res.clearCookie).toHaveBeenCalledTimes(1);
    });

    it.each([{ origin: 'https://evil.example' }, { origin: 'null' }, { referer: 'not a url' }, {}])(
      'refuses a request from another site (%j)',
      async (headers) => {
        await expect(
          controller.logout(request({ ...headers, cookie: `${SESSION_COOKIE}=tok` }), res as unknown as Response),
        ).rejects.toThrow(ForbiddenException);
        expect(sessions.close).not.toHaveBeenCalled();
        expect(res.clearCookie).not.toHaveBeenCalled();
      },
    );
  });

  describe('backchannelLogout', () => {
    it('ends the sessions the logout token names', async () => {
      identity.verifyLogoutToken.mockResolvedValue({ sub: 'u1', sid: 'sid-1' });

      await controller.backchannelLogout({ logout_token: 'jwt' });

      expect(identity.verifyLogoutToken).toHaveBeenCalledExactlyOnceWith('jwt');
      expect(sessions.end).toHaveBeenCalledExactlyOnceWith({ sub: 'u1', sid: 'sid-1' });
    });

    it.each([undefined, {}, { logout_token: '' }, { logout_token: 7 }])('requires a token (%j)', async (body) => {
      await expect(controller.backchannelLogout(body)).rejects.toThrow(BadRequestException);
      expect(identity.verifyLogoutToken).not.toHaveBeenCalled();
    });

    it('refuses an invalid token and ends nothing', async () => {
      identity.verifyLogoutToken.mockRejectedValue(new Error('bad signature'));

      await expect(controller.backchannelLogout({ logout_token: 'jwt' })).rejects.toThrow('Invalid logout token');
      expect(sessions.end).not.toHaveBeenCalled();
    });
  });

  describe('accountDeleted', () => {
    it('forgets the account a valid notice names', async () => {
      identity.verifyAccountDeletion.mockResolvedValue('u1');

      await controller.accountDeleted('jwt');

      expect(identity.verifyAccountDeletion).toHaveBeenCalledExactlyOnceWith('jwt');
      expect(sessions.forget).toHaveBeenCalledExactlyOnceWith('u1');
    });

    it.each([undefined, '', { token: 'jwt' }])('requires a signed notice (%j)', async (body) => {
      await expect(controller.accountDeleted(body)).rejects.toThrow(BadRequestException);
      expect(identity.verifyAccountDeletion).not.toHaveBeenCalled();
    });

    it('refuses an invalid notice and forgets nothing', async () => {
      identity.verifyAccountDeletion.mockRejectedValue(new Error('expired'));

      await expect(controller.accountDeleted('jwt')).rejects.toThrow('Invalid deletion notice');
      expect(sessions.forget).not.toHaveBeenCalled();
    });
  });
});
