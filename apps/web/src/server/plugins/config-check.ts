// Nitro plugin: checks the configuration when the server starts and exits with a clear message when it is
// invalid (missing or short BETTER_AUTH_SECRET, PASSWORD_LOGIN=disabled without SSO, a malformed OIDC_ISSUER,
// ...), instead of failing on the first request. Registered in vite.config.ts (nitro `plugins`).
import { definePlugin } from 'nitro';
import { readServerConfig, ServerConfigError } from '../config';

export default definePlugin(() => {
  try {
    readServerConfig(process.env);
  } catch (error) {
    if (!(error instanceof ServerConfigError)) throw error;
    console.error(error.message);
    // In `vite dev`, Nitro would restart its runner in a loop; the dev server stays up and every request
    // fails with the same message instead.
    if (process.env.NODE_ENV !== 'development') process.exit(1);
  }
});
