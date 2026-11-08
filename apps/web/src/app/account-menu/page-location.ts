import { DOCUMENT } from '@angular/common';
import { inject, InjectionToken } from '@angular/core';

/** The page's address, behind a token so specs can follow where the browser is sent. */
export interface PageLocation {
  readonly pathname: string;
  readonly search: string;
  /** Leaves the app (sign-in and sign-out happen on the identity service's pages). */
  assign(url: string): void;
  /** Rewrites the query string without reloading or adding a history entry. */
  replaceSearch(search: string): void;
}

export const PAGE_LOCATION = new InjectionToken<PageLocation>('PAGE_LOCATION', {
  providedIn: 'root',
  factory: () => {
    const view = inject(DOCUMENT).defaultView as Window;
    return {
      get pathname() {
        return view.location.pathname;
      },
      get search() {
        return view.location.search;
      },
      assign: (url) => view.location.assign(url),
      replaceSearch: (search) =>
        view.history.replaceState(view.history.state, '', `${view.location.pathname}${search}${view.location.hash}`),
    };
  },
});
