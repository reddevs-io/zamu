import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { createAuthClient } from 'better-auth/react';
import { useCallback } from 'react';

/**
 * Better Auth browser client. It talks to /api/auth on the page's own origin, so the server's
 * BETTER_AUTH_URL must match the origin people open the app on. Sign-up is not available here:
 * accounts come from first-run setup and invitations (server functions in lib/session.ts).
 */
export const authClient = createAuthClient();

/** Better Auth error codes the screens turn into copy. */
export const AUTH_ERRORS = {
  invalidCredentials: 'INVALID_EMAIL_OR_PASSWORD',
  passwordLoginDisabled: 'PASSWORD_LOGIN_DISABLED',
} as const;

export interface SsoSignInOptions {
  /** setup: the first-run screen; invite: an invitation link (its email must match); signin otherwise. */
  intent: 'signin' | 'setup' | 'invite';
  invitationId?: string;
  /** Same-origin path after a successful sign-in. */
  callbackURL: string;
  /** Same-origin path that shows `?error=<code>` when the sign-in fails. */
  errorCallbackURL: string;
}

/**
 * Starts single sign-on: Better Auth answers with the provider's authorization URL and the browser goes
 * there. Resolves with an error message only when the redirect could not start.
 */
export async function signInWithSso({
  intent,
  invitationId,
  callbackURL,
  errorCallbackURL,
}: SsoSignInOptions): Promise<string | null> {
  const { error } = await authClient.signIn.social({
    provider: 'oidc',
    callbackURL,
    errorCallbackURL,
    additionalData: { pmIntent: intent, ...(invitationId ? { pmInvitationId: invitationId } : {}) },
  });
  if (!error) return null;
  // Typically the provider was unreachable when the server tried its discovery document.
  console.error('SSO sign-in could not start:', error);
  return 'Single sign-on is not available right now. Try again in a moment.';
}

/** Ends the session (POST /api/auth/sign-out). */
export async function signOut(): Promise<void> {
  const { error } = await authClient.signOut();
  if (error) throw new Error(error.message ?? 'Sign out failed.');
}

/**
 * Sign out action for the app shell: ends the session, drops cached queries and goes to /signin.
 *
 *   const signOut = useSignOut();
 *   <MenuItem onAction={signOut}>Sign out</MenuItem>
 */
export function useSignOut(): () => Promise<void> {
  const router = useRouter();
  const queryClient = useQueryClient();
  return useCallback(async () => {
    await signOut();
    queryClient.clear();
    await router.navigate({ to: '/signin' });
  }, [router, queryClient]);
}
