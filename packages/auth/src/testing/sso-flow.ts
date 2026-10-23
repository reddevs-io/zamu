// Drives a complete SSO sign-in against a Better Auth instance and the mock provider, the way a browser
// would: POST /sign-in/social, follow the provider's authorize redirect, then call the callback URL.
import type { Auth } from '../auth';
import type { SsoIntentData } from '../sso';
import { TEST_BASE_URL } from './helpers';
import type { MockIdentity, MockOidc } from './mock-oidc';

export interface SsoFlowOptions {
  intent?: SsoIntentData['pmIntent'];
  invitationId?: string;
  callbackURL?: string;
  errorCallbackURL?: string;
}

export interface SsoFlowResult {
  /** The authorization URL the app sent the browser to. */
  authorizationUrl: URL;
  /** The provider's redirect back to the app (the callback URL with code and state). */
  callbackUrl: URL;
  /** Where the app sent the browser after the callback. */
  location: URL;
  /** The `error` query parameter of `location`, or null after a successful sign-in. */
  error: string | null;
  /** Cookie header with the session, after a successful sign-in. */
  cookie: string;
}

function cookieHeader(headers: Headers): string {
  return headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0])
    .filter((cookie) => cookie && !cookie.endsWith('='))
    .join('; ');
}

export async function ssoSignIn(
  auth: Auth,
  mock: MockOidc,
  identity: MockIdentity,
  { intent = 'signin', invitationId, callbackURL = '/', errorCallbackURL = '/signin' }: SsoFlowOptions = {},
): Promise<SsoFlowResult> {
  mock.addIdentity(identity);
  const start = await auth.handler(
    new Request(`${TEST_BASE_URL}/api/auth/sign-in/social`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: TEST_BASE_URL },
      body: JSON.stringify({
        provider: 'oidc',
        callbackURL,
        errorCallbackURL,
        loginHint: identity.email,
        additionalData: { pmIntent: intent, ...(invitationId ? { pmInvitationId: invitationId } : {}) },
      }),
    }),
  );
  if (!start.ok) throw new Error(`sign-in/social failed: ${start.status} ${await start.text()}`);
  const { url } = (await start.json()) as { url: string };
  const stateCookie = cookieHeader(start.headers);

  const authorize = await fetch(url, { redirect: 'manual' });
  const redirect = authorize.headers.get('location');
  if (!redirect) throw new Error(`authorize did not redirect: ${authorize.status} ${await authorize.text()}`);
  const callbackUrl = new URL(redirect);

  const callback = await auth.handler(
    new Request(callbackUrl, { headers: stateCookie ? { cookie: stateCookie } : {} }),
  );
  const target = callback.headers.get('location');
  if (!target) throw new Error(`callback did not redirect: ${callback.status} ${await callback.text()}`);
  const location = new URL(target, TEST_BASE_URL);
  return {
    authorizationUrl: new URL(url),
    callbackUrl,
    location,
    error: location.searchParams.get('error'),
    cookie: cookieHeader(callback.headers),
  };
}
