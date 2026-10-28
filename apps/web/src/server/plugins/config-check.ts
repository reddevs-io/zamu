// Nitro plugin: checks the configuration when the server starts and exits 1 with a clear message, before it
// listens, when it is invalid (missing or short BETTER_AUTH_SECRET, PASSWORD_LOGIN=disabled without SSO, a
// malformed OIDC_ISSUER, ...), instead of failing on every request. In `vite dev` it only logs (see
// checkServerConfig). Registered in vite.config.ts (nitro `plugins`).
import { definePlugin } from 'nitro';
import { checkServerConfig } from '../config';

export default definePlugin(() => {
  checkServerConfig({
    env: process.env,
    logger: console,
    exit: (code) => process.exit(code),
    // The production build inlines NODE_ENV as "production", so a built server always exits.
    nodeEnv: process.env.NODE_ENV,
  });
});
