// Server-side half of the settings server functions: resolve the actor from the request, call one
// core service, and turn core's errors into a SettingsResult. No business rules live here.
// Server-only (imports @pm/auth and @pm/core); import it only from server function handlers and tests.
import { getActorFromRequest } from '@pm/auth';
import { type Actor, type CoreContext, isCoreError } from '@pm/core';
import type { SettingsResult } from './result';

/** Calls `service` as `actor` and wraps the outcome. Errors that are not core's propagate (500). */
export async function runAs<T>(
  core: CoreContext,
  actor: Actor | null,
  service: (core: CoreContext, actor: Actor) => Promise<T>,
): Promise<SettingsResult<T>> {
  if (!actor) {
    return { ok: false, error: { code: 'UNAUTHORIZED', message: 'Sign in again to continue.', issues: [] } };
  }
  try {
    return { ok: true, data: await service(core, actor) };
  } catch (error) {
    if (isCoreError(error)) {
      return { ok: false, error: { code: error.code, message: error.message, issues: error.issues ?? [] } };
    }
    // The browser only sees a generic failure, so the server log is the one place the cause shows.
    console.error('settings: unhandled error:', error);
    throw error;
  }
}

/** Resolves the actor from the request headers (session cookie or API key), then calls `service`. */
export async function runForRequest<T>(
  core: CoreContext,
  headers: Headers,
  service: (core: CoreContext, actor: Actor) => Promise<T>,
): Promise<SettingsResult<T>> {
  const actor = await getActorFromRequest(core, { headers });
  return runAs(core, actor, service);
}
