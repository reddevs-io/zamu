// The web server's single set of long-lived services: one Postgres pool, one Better Auth instance
// and the core context built on them. Better Auth (/api/auth), the session helpers, the /api/v1
// handler and server-side oRPC calls all share it.
// Framework-free on purpose: tests and scripts import it without TanStack Start.
import { type Auth, createAuth } from '@pm/auth';
import type { CoreContext } from '@pm/core';
import { createDb, type Db, type DbHandle } from '@pm/db';
import { readServerConfig, type ServerEnv } from './config';

export type { ServerEnv } from './config';

export interface ServerContext extends CoreContext {
  db: Db;
  auth: Auth;
  pool: DbHandle['pool'];
}

/**
 * Builds the services from environment variables. Call once per process; see getServerContext.
 * Throws ServerConfigError when the configuration is invalid (see config.ts).
 */
export function createServerContext(env: ServerEnv = process.env): ServerContext {
  const config = readServerConfig(env);
  const { db, pool } = createDb(config.databaseUrl);
  // Without a listener, an idle connection that breaks (Postgres restart) crashes the server.
  pool.on('error', (error) => console.error('server: idle database connection failed:', error.message));
  const auth = createAuth({ db, secret: config.secret, baseUrl: config.baseUrl, config: config.auth });
  // PUBLIC_URL builds invitation links; it matches BETTER_AUTH_URL unless a proxy says otherwise.
  return { db, auth, pool, publicUrl: config.publicUrl };
}

const globalKey = Symbol.for('pm.web.serverContext');
type GlobalWithContext = typeof globalThis & { [globalKey]?: ServerContext };

/**
 * The process-wide ServerContext, created on first use from process.env. Kept on globalThis so
 * dev-server module reloads reuse the pool instead of leaking one per reload.
 */
export function getServerContext(): ServerContext {
  const store = globalThis as GlobalWithContext;
  store[globalKey] ??= createServerContext();
  return store[globalKey];
}
