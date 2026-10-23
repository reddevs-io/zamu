// Where a route sends the visitor, given the instance and session state. Pure, so it is unit tested;
// lib/session.ts turns the result into a TanStack Router redirect.

/**
 * - `setup`: the first-run form, only until the instance has a workspace.
 * - `guest`: sign-in and invitation accept, for signed-out visitors.
 * - `app`: signed-in pages.
 * - `any`: everything else (only the first-run rule applies).
 */
export type AuthPage = 'setup' | 'guest' | 'app' | 'any';

export interface AuthState {
  /** True until the first workspace exists (after setup via SSO, the admin is signed in but not done). */
  firstRun: boolean;
  signedIn: boolean;
}

export type AuthRedirect = { to: '/setup' } | { to: '/signin'; redirect?: string } | { to: '/' };

/** Null when the visitor may stay on the page. `href` is the requested URL, kept for after sign-in. */
export function authRedirect(page: AuthPage, state: AuthState, href = '/'): AuthRedirect | null {
  // Until the first workspace exists, every page leads to the setup form.
  if (state.firstRun) return page === 'setup' ? null : { to: '/setup' };
  switch (page) {
    case 'setup':
      return state.signedIn ? { to: '/' } : { to: '/signin' };
    case 'guest':
      return state.signedIn ? { to: '/' } : null;
    case 'app':
      if (state.signedIn) return null;
      return href === '/' ? { to: '/signin' } : { to: '/signin', redirect: href };
    case 'any':
      return null;
  }
}
