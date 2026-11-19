import { createFileRoute } from '@tanstack/react-router';
import { getAuthContext } from '~/lib/session';

// Better Auth endpoints (sign-in, sign-out, sessions, organizations, API keys) under /api/auth/*.

/**
 * Public sign-up is closed: accounts come from first-run setup and invitation accept, both server
 * functions. @zamu/auth refuses HTTP sign-up too; this also covers paths Better Auth does not know.
 */
function isSignUp(request: Request): boolean {
  const { pathname } = new URL(request.url);
  return pathname === '/api/auth/sign-up' || pathname.startsWith('/api/auth/sign-up/');
}

function handle({ request }: { request: Request }) {
  if (isSignUp(request)) {
    return Response.json(
      {
        code: 'SIGN_UP_DISABLED',
        message: 'Sign-up is closed. Open the invitation link your admin sent you.',
      },
      { status: 403 },
    );
  }
  return getAuthContext().auth.handler(request);
}

export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: handle,
      POST: handle,
    },
  },
});
