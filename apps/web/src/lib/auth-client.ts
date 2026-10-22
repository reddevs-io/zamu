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
} as const;

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
