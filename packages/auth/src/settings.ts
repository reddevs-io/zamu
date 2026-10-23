// The sign-in configuration each Better Auth instance was created with, so helpers that receive the
// instance (bootstrapAdmin, acceptInvitationWithSignUp, the web screens) follow the same rules.
import type { AuthConfig } from './config';

const settingsByAuth = new WeakMap<object, AuthConfig>();

/** M1 behaviour: passwords only. */
export const DEFAULT_AUTH_CONFIG: AuthConfig = { sso: null, passwordLogin: true };

export function registerAuthConfig(auth: object, config: AuthConfig): void {
  settingsByAuth.set(auth, config);
}

/** The configuration `auth` was created with (createAuth's `config` option). */
export function authConfigOf(auth: object): AuthConfig {
  return settingsByAuth.get(auth) ?? DEFAULT_AUTH_CONFIG;
}
