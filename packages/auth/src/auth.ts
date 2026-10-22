import { type Db, schema } from '@pm/db';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { and, eq, gt, sql } from 'drizzle-orm';
import { authOptions } from './options';

export interface CreateAuthOptions {
  db: Db;
  /** BETTER_AUTH_SECRET, at least 32 characters. */
  secret: string;
  /** BETTER_AUTH_URL, the origin the /api/auth endpoints are served from. */
  baseUrl: string;
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

/** Creates the Better Auth instance: email and password, workspaces (organization plugin) and API keys. */
export function createAuth({ db, secret, baseUrl }: CreateAuthOptions) {
  return betterAuth({
    ...authOptions({ secret, baseUrl }),
    // Better Auth validates this schema at startup, so pass every table.
    database: drizzleAdapter(db, { provider: 'pg', schema, transaction: true }),
    hooks: {
      // Self-hosted instances are closed: the first account comes from bootstrapAdmin, every later
      // account from acceptInvitationWithSignUp, which proves the caller holds the invitation id.
      // Public HTTP sign-up is therefore always refused: knowing an invited email is not enough.
      // Server-side auth.api calls (no ctx.request) still need a pending invitation for the email.
      before: createAuthMiddleware(async (ctx) => {
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
}

/** The Better Auth instance returned by createAuth. */
export type Auth = ReturnType<typeof createAuth>;
