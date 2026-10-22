// Shared fixtures for @pm/auth tests.
import type { Db } from '@pm/db';
import { createAuth } from '../auth';

export const TEST_SECRET = 'test-secret-test-secret-test-secret-0123';
export const TEST_BASE_URL = 'http://localhost:3000';

export function testAuth(db: Db) {
  return createAuth({ db, secret: TEST_SECRET, baseUrl: TEST_BASE_URL });
}

/** Turns Set-Cookie response headers into a request Cookie header. */
export function cookieHeaders(responseHeaders: Headers): Headers {
  const cookies = responseHeaders
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0])
    .filter(Boolean)
    .join('; ');
  return new Headers({ cookie: cookies });
}
