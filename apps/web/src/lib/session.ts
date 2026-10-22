import {
  AcceptInvitationError,
  type Auth,
  acceptInvitationWithSignUp,
  BootstrapError,
  bootstrapAdmin,
  isFirstRun,
} from '@pm/auth';
import type { Db } from '@pm/db';
import { redirect } from '@tanstack/react-router';
import { createServerFn, createServerOnlyFn } from '@tanstack/react-start';
import { appendResponseHeader, getRequestHeaders } from '@tanstack/react-start/server';
import { type AuthPage, type AuthState, authRedirect } from '../routes/(auth)/-auth/guards';
import { loadInstanceName, loadInvitation } from '../routes/(auth)/-auth/queries';
import { AcceptInvitationInput, SetupInput } from '../routes/(auth)/-auth/validation';
import { getServerContext } from '../server/context';

// Session helpers for route `beforeLoad` and the signed-out screens.
// Server function handlers and createServerOnlyFn bodies are stripped from the client bundle, so the
// @pm/auth and @pm/db imports above never reach the browser.

interface AuthContext {
  auth: Auth;
  db: Db;
}

/**
 * The server's Better Auth instance and database: the process-wide ServerContext from
 * server/context.ts, shared with /api/v1, so the web server has one pool.
 */
export const getAuthContext = createServerOnlyFn((): AuthContext => getServerContext());

/** The signed-in user and session, safe to send to the browser. */
export interface SessionInfo {
  user: { id: string; name: string; email: string; image: string | null };
  session: { id: string; expiresAt: Date; activeWorkspaceId: string | null };
}

async function readSession(): Promise<SessionInfo | null> {
  const { auth } = getAuthContext();
  const result = await auth.api.getSession({ headers: getRequestHeaders() });
  if (!result) return null;
  // Better Auth 1.7 types activeOrganizationId only with teams or dynamic access control; it exists at runtime.
  const activeWorkspaceId =
    (result.session as { activeOrganizationId?: string | null }).activeOrganizationId ?? null;
  return {
    user: {
      id: result.user.id,
      name: result.user.name,
      email: result.user.email,
      image: result.user.image ?? null,
    },
    session: { id: result.session.id, expiresAt: result.session.expiresAt, activeWorkspaceId },
  };
}

/** The current session, or null when signed out. */
export const getSession = createServerFn({ method: 'GET' }).handler(() => readSession());

/** First-run flag and session in one round trip, for the guards. */
const getAuthState = createServerFn({ method: 'GET' }).handler(async () => {
  const { db } = getAuthContext();
  const firstRun = await isFirstRun(db);
  return { firstRun, session: firstRun ? null : await readSession() };
});

const checkFirstRun = createServerFn({ method: 'GET' }).handler(async () => {
  const { db } = getAuthContext();
  return isFirstRun(db);
});

// Once an instance has a user it never goes back to first run, so the browser stops asking.
let setUpSeen = false;

interface GuardLocation {
  href: string;
  pathname: string;
}

function throwRedirect(target: NonNullable<ReturnType<typeof authRedirect>>): never {
  if (target.to === '/signin' && target.redirect) {
    throw redirect({ to: '/signin', search: { redirect: target.redirect } });
  }
  throw redirect({ to: target.to });
}

/**
 * Applies the auth rules for a page: throws a redirect, or returns the session (null when signed out).
 * Use in `beforeLoad` of the signed-out screens.
 */
export async function guardAuthPage(
  page: AuthPage,
  location: GuardLocation,
): Promise<{ session: SessionInfo | null }> {
  const state = await getAuthState();
  if (!state.firstRun) setUpSeen = true;
  const auth: AuthState = { firstRun: state.firstRun, signedIn: state.session !== null };
  const target = authRedirect(page, auth, location.href);
  if (target) throwRedirect(target);
  return { session: state.session };
}

/**
 * For `beforeLoad` of signed-in routes: returns the session, or redirects to /signin
 * (with ?redirect= back to the requested page), or to /setup on first run.
 */
export async function requireSession({ location }: { location: GuardLocation }): Promise<{
  session: SessionInfo;
}> {
  const { session } = await guardAuthPage('app', location);
  if (!session) throw redirect({ to: '/signin' });
  return { session };
}

/**
 * For the root route's `beforeLoad`: sends every page to /setup while the instance has no user.
 * After the first check that finds a user, browser navigations skip the server call.
 */
export async function requireSetUp({ location }: { location: GuardLocation }): Promise<void> {
  if (setUpSeen || location.pathname === '/setup' || location.pathname.startsWith('/__ui')) return;
  const firstRun = await checkFirstRun();
  if (!firstRun) {
    setUpSeen = true;
    return;
  }
  throw redirect({ to: '/setup' });
}

/** Workspace name for the sign-in title and brand; null before setup. */
export const getInstanceName = createServerFn({ method: 'GET' }).handler(async () =>
  loadInstanceName(getAuthContext().db),
);

/** The invitation behind /invite/$id, with a state the screen turns into the form or an error. */
export const getInvitation = createServerFn({ method: 'GET' })
  .validator((input: { id: string }) => ({ id: String(input.id) }))
  .handler(async ({ data }) => loadInvitation(getAuthContext().db, data.id));

export type SetupResult =
  | { ok: true }
  | { ok: false; code: 'ALREADY_SET_UP' | 'INVALID_INPUT'; message: string };

/**
 * First-run setup: creates the admin, the workspace and the owner membership (bootstrapAdmin).
 * The browser signs in with the same credentials afterwards.
 */
export const setupInstance = createServerFn({ method: 'POST' })
  .validator(SetupInput)
  .handler(async ({ data }): Promise<SetupResult> => {
    try {
      await bootstrapAdmin(getAuthContext(), data);
      return { ok: true };
    } catch (error) {
      if (error instanceof BootstrapError) return { ok: false, code: error.code, message: error.message };
      throw error;
    }
  });

export type AcceptInvitationResult =
  | { ok: true }
  | { ok: false; code: 'INVITATION_NOT_USABLE' | 'ACCOUNT_EXISTS' | 'INVALID_INPUT'; message: string };

/**
 * Invitation accept: creates the account for the invitation's email (never one sent by the browser),
 * signs the person in through the session cookie on this response, and joins the workspace.
 * Public HTTP sign-up is closed; this is the only way in besides first-run setup.
 */
export const acceptInvitation = createServerFn({ method: 'POST' })
  .validator(AcceptInvitationInput)
  .handler(async ({ data }): Promise<AcceptInvitationResult> => {
    try {
      const result = await acceptInvitationWithSignUp(getAuthContext(), data, {
        headers: getRequestHeaders(),
      });
      for (const cookie of result.setCookies) appendResponseHeader('set-cookie', cookie);
      return { ok: true };
    } catch (error) {
      if (error instanceof AcceptInvitationError) {
        return { ok: false, code: error.code, message: error.message };
      }
      throw error;
    }
  });
