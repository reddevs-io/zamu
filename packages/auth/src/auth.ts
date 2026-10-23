import { AsyncLocalStorage } from 'node:async_hooks';
import { type Db, schema, type Tx } from '@pm/db';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { and, eq, gt, sql } from 'drizzle-orm';
import type { AuthConfig } from './config';
import { authOptions } from './options';
import { DEFAULT_AUTH_CONFIG, registerAuthConfig } from './settings';
import { createSsoGate } from './sso';

export interface CreateAuthOptions {
  db: Db;
  /** BETTER_AUTH_SECRET, at least 32 characters. */
  secret: string;
  /** BETTER_AUTH_URL, the origin the /api/auth endpoints are served from. */
  baseUrl: string;
  /** Single sign-on and password sign-in (readAuthConfig). Defaults to passwords only, as in M1. */
  config?: AuthConfig;
}

/** Error code when PASSWORD_LOGIN=disabled and someone tries a password. */
export const PASSWORD_LOGIN_DISABLED = 'PASSWORD_LOGIN_DISABLED';

/**
 * Wraps `db` so Better Auth's transactions are visible through `transactions`: the SSO gate checks a new
 * user inside the transaction that creates it, under the first-run advisory lock.
 */
function trackTransactions(db: Db, transactions: AsyncLocalStorage<Tx>): Db {
  return new Proxy(db, {
    get(target, property) {
      if (property === 'transaction') {
        const transaction: Db['transaction'] = (run, config) =>
          target.transaction((tx) => transactions.run(tx, () => run(tx)), config);
        return transaction;
      }
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

/** True when a pending, unexpired invitation exists for `email`. */
export async function hasPendingInvitation(db: Db, email: string): Promise<boolean> {
  const rows = await db
    .select({ id: schema.invitation.id })
    .from(schema.invitation)
    .where(
      and(
        eq(sql`lower(${schema.invitation.email})`, email.trim().toLowerCase()),
        eq(schema.invitation.status, 'pending'),
        gt(schema.invitation.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * Creates the Better Auth instance: email and password, workspaces (organization plugin), API keys and,
 * when configured, single sign-on with one OpenID Connect provider.
 */
export function createAuth({ db, secret, baseUrl, config = DEFAULT_AUTH_CONFIG }: CreateAuthOptions) {
  const { sso, passwordLogin } = config;
  const transactions = new AsyncLocalStorage<Tx>();
  const gate = sso ? createSsoGate({ db, sso, transactions }) : null;
  const options = authOptions({ secret, baseUrl, sso });

  const auth = betterAuth({
    ...options,
    user: {
      ...options.user,
      ...(gate ? { validateUserInfo: gate.validateUserInfo } : {}),
    },
    // Better Auth validates this schema at startup, so pass every table.
    database: drizzleAdapter(trackTransactions(db, transactions), {
      provider: 'pg',
      schema,
      transaction: true,
    }),
    databaseHooks: gate
      ? {
          session: {
            create: {
              before: async (session, ctx) => {
                await gate.beforeSessionCreate(session, ctx);
              },
            },
          },
        }
      : undefined,
    hooks: {
      // Self-hosted instances are closed: the first account comes from bootstrapAdmin, every later
      // account from acceptInvitationWithSignUp, which proves the caller holds the invitation id.
      // Public HTTP sign-up is therefore always refused: knowing an invited email is not enough.
      // Server-side auth.api calls (no ctx.request) still need a pending invitation for the email.
      before: createAuthMiddleware(async (ctx) => {
        if (!passwordLogin && (ctx.path === '/sign-in/email' || ctx.path.startsWith('/sign-up'))) {
          throw new APIError('FORBIDDEN', {
            code: PASSWORD_LOGIN_DISABLED,
            message: 'Password sign-in is turned off on this server. Use single sign-on.',
          });
        }
        if (!ctx.path.startsWith('/sign-up')) return;
        if (ctx.request) {
          throw new APIError('FORBIDDEN', {
            code: 'SIGN_UP_DISABLED',
            message: 'Sign-up is closed. Open the invitation link your admin sent you.',
          });
        }
        const email = typeof ctx.body?.email === 'string' ? ctx.body.email : '';
        if (!email || !(await hasPendingInvitation(db, email))) {
          throw new APIError('FORBIDDEN', {
            code: 'SIGN_UP_REQUIRES_INVITATION',
            message: 'Sign-up needs a pending invitation for this email address.',
          });
        }
      }),
    },
  });
  registerAuthConfig(auth, config);
  return auth;
}

/** The Better Auth instance returned by createAuth. */
export type Auth = ReturnType<typeof createAuth>;
