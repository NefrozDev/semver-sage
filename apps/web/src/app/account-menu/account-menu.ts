import { HttpClient, httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { AuthSession } from '@semver-sage/types';
import { firstValueFrom } from 'rxjs';
import { PAGE_LOCATION } from './page-location';

/** How the API sends the browser back after a sign-in that did not open a session. */
const NOTICES: Record<string, string> = {
  cancelled: 'Sign-in cancelled.',
  failed: "Sign-in didn't work. Try again in a moment.",
};

/** The query string without `signIn`, the API's word on the last sign-in. */
function withoutSignInParam(search: string): string {
  const params = new URLSearchParams(search);
  params.delete('signIn');
  const rest = params.toString();
  return rest ? `?${rest}` : '';
}

/**
 * Signing in with the Synapse account, shared by every Synapse Engineering app. Asking
 * questions never needs it: the header only shows who is signed in. Shows nothing while the
 * session is unknown or the API is down.
 */
@Component({
  selector: 'app-account-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './account-menu.html',
  styleUrl: './account-menu.scss',
})
export class AccountMenu {
  private readonly http = inject(HttpClient);
  private readonly location = inject(PAGE_LOCATION);

  protected readonly session = httpResource<AuthSession>(() => '/api/auth/session');
  protected readonly user = computed(() => (this.session.hasValue() ? this.session.value() : null));
  protected readonly signingOut = signal(false);
  protected readonly notice = signal<string | null>(null);

  /** Back to this very page after signing in. */
  protected readonly signInUrl = computed(() => {
    const returnTo = `${this.location.pathname}${withoutSignInParam(this.location.search)}`;
    return `/api/auth/login?${new URLSearchParams({ returnTo })}`;
  });

  constructor() {
    const outcome = new URLSearchParams(this.location.search).get('signIn');
    if (outcome !== null) {
      this.notice.set(NOTICES[outcome] ?? null);
      // Said once: a reload or a shared link should not repeat it.
      this.location.replaceSearch(withoutSignInParam(this.location.search));
    }
  }

  /** Ends Semver Sage's session, then lets the identity service sign out of every app. */
  protected async signOut(): Promise<void> {
    this.signingOut.set(true);
    this.notice.set(null);
    try {
      const { redirectTo } = await firstValueFrom(this.http.post<{ redirectTo: string }>('/api/auth/logout', null));
      this.location.assign(redirectTo);
    } catch {
      this.notice.set("Sign-out didn't work. Try again in a moment.");
      this.signingOut.set(false);
      this.session.reload();
    }
  }
}
