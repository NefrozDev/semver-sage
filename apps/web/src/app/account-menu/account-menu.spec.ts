import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { AuthSession } from '@semver-sage/types';
import type { Mock } from 'vitest';
import { AccountMenu } from './account-menu';
import { PAGE_LOCATION, type PageLocation } from './page-location';

const ACCOUNT_URL = 'https://auth.example/account';
const SIGN_OUT_URL = 'https://auth.example/oidc/session/end?client_id=semver-sage';

describe('AccountMenu', () => {
  let location: {
    pathname: string;
    search: string;
    assign: Mock<PageLocation['assign']>;
    replaceSearch: Mock<PageLocation['replaceSearch']>;
  };
  let http: HttpTestingController;

  async function render(session: AuthSession | 'error', address = { pathname: '/', search: '' }) {
    location = {
      ...address,
      assign: vi.fn<PageLocation['assign']>(),
      replaceSearch: vi.fn<PageLocation['replaceSearch']>(),
    };
    TestBed.configureTestingModule({
      imports: [AccountMenu],
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: PAGE_LOCATION, useValue: location }],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(AccountMenu);
    TestBed.tick();
    const request = http.expectOne('/api/auth/session');
    if (session === 'error') request.flush('down', { status: 502, statusText: 'Bad Gateway' });
    else request.flush(session);
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  const button = (el: HTMLElement, name: string) =>
    [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === name) as HTMLButtonElement;
  const link = (el: HTMLElement, name: string) =>
    [...el.querySelectorAll('a')].find((a) => a.textContent?.trim() === name) as HTMLAnchorElement;

  afterEach(() => http.verify());

  it('offers to sign in, back to the same page', async () => {
    const { el } = await render({ username: null, accountUrl: ACCOUNT_URL }, { pathname: '/', search: '?q=filters' });

    expect(link(el, 'Sign in').getAttribute('href')).toBe('/api/auth/login?returnTo=%2F%3Fq%3Dfilters');
    expect(el.textContent).not.toContain('Signed in as');
    expect(el.querySelector('[role="status"]')).toBeNull();
    expect(location.replaceSearch).not.toHaveBeenCalled();
  });

  it('names the signed-in person, links their account in a new tab and offers to sign out', async () => {
    const { el } = await render({ username: 'ada', accountUrl: ACCOUNT_URL });

    expect(el.querySelector('.who')?.textContent?.trim()).toBe('Signed in as ada');
    const account = link(el, 'Account');
    expect(account.href).toBe(ACCOUNT_URL);
    expect(account.target).toBe('_blank');
    expect(account.rel).toBe('noopener');
    expect(button(el, 'Sign out').disabled).toBe(false);
    expect(link(el, 'Sign in')).toBeUndefined();
  });

  it('shows nothing when the API cannot say who is signed in', async () => {
    const { el } = await render('error');

    expect(el.textContent?.trim()).toBe('');
  });

  it('ends the session, then sends the browser to the identity service to sign out everywhere', async () => {
    const { fixture, el } = await render({ username: 'ada', accountUrl: ACCOUNT_URL });

    button(el, 'Sign out').click();
    await fixture.whenStable();
    expect(button(el, 'Sign out').disabled).toBe(true);
    expect(location.assign).not.toHaveBeenCalled();

    const logout = http.expectOne('/api/auth/logout');
    expect(logout.request.method).toBe('POST');
    logout.flush({ redirectTo: SIGN_OUT_URL });
    await fixture.whenStable();

    expect(location.assign).toHaveBeenCalledExactlyOnceWith(SIGN_OUT_URL);
  });

  it('says so and asks again who is signed in when signing out fails', async () => {
    const { fixture, el } = await render({ username: 'ada', accountUrl: ACCOUNT_URL });

    button(el, 'Sign out').click();
    await fixture.whenStable();
    http.expectOne('/api/auth/logout').flush('no', { status: 403, statusText: 'Forbidden' });
    await fixture.whenStable();
    // The resource asks again on the next change detection.
    TestBed.tick();
    http.expectOne('/api/auth/session').flush({ username: 'ada', accountUrl: ACCOUNT_URL });
    await fixture.whenStable();

    expect(location.assign).not.toHaveBeenCalled();
    expect(el.querySelector('[role="status"]')?.textContent).toBe("Sign-out didn't work. Try again in a moment.");
    expect(button(el, 'Sign out').disabled).toBe(false);
  });

  it.each([
    ['cancelled', 'Sign-in cancelled.'],
    ['failed', "Sign-in didn't work. Try again in a moment."],
  ])('says once that the last sign-in was %s, and drops it from the address', async (outcome, message) => {
    const { el } = await render(
      { username: null, accountUrl: ACCOUNT_URL },
      { pathname: '/', search: `?q=filters&signIn=${outcome}` },
    );

    expect(el.querySelector('[role="status"]')?.textContent).toBe(message);
    expect(location.replaceSearch).toHaveBeenCalledExactlyOnceWith('?q=filters');
    expect(link(el, 'Sign in').getAttribute('href')).toBe('/api/auth/login?returnTo=%2F%3Fq%3Dfilters');
  });

  it('drops an unknown sign-in outcome from the address without showing it', async () => {
    const { el } = await render({ username: null, accountUrl: ACCOUNT_URL }, { pathname: '/', search: '?signIn=<b>' });

    expect(el.querySelector('[role="status"]')).toBeNull();
    expect(location.replaceSearch).toHaveBeenCalledExactlyOnceWith('');
  });
});
