// Single sign-on with one OpenID Connect provider (Better Auth's generic OAuth plugin), and the rules
// for who gets in: which identities may create an account, link to an existing one, and which role
// they get in the workspace.
import type { AsyncLocalStorage } from 'node:async_hooks';
import { type Db, schema, type Tx } from '@pm/db';
import type { BetterAuthOptions, BetterAuthPlugin } from 'better-auth';
import { APIError, getOAuthState } from 'better-auth/api';
import { type GenericOAuthUserInfo, genericOAuth } from 'better-auth/plugins/generic-oauth';
import { and, asc, desc, eq, gt, sql } from 'drizzle-orm';
import { BOOTSTRAP_LOCK_KEY, isFirstRun } from './bootstrap';
import { discoveryUrl, OIDC_CALLBACK_PATH, OIDC_PROVIDER_ID, type SsoConfig } from './config';

/**
 * Error codes an SSO sign-in can end with. Better Auth redirects to the page's errorCallbackURL with
 * `?error=<code>`; the sign-in, setup and invitation screens turn them into copy.
 */
export const SSO_ERRORS = {
  /** The provider did not mark the email address as verified. */
  emailNotVerified: 'sso_email_not_verified',
  /** invite mode: no account and no pending invitation for this email. */
  noAccount: 'sso_no_account',
  /** The email belongs to an agent, or the account cannot use SSO. */
  accountNotAllowed: 'sso_account_not_allowed',
  /** Setup via SSO after the first person exists. */
  alreadySetUp: 'sso_already_set_up',
  /** A new identity before setup finished (no workspace yet). */
  notSetUp: 'sso_not_set_up',
  /** The verified email differs from the invitation's email. */
  invitationEmailMismatch: 'sso_invitation_email_mismatch',
  /** The invitation is unknown, used, withdrawn or expired. */
  invitationNotUsable: 'sso_invitation_not_usable',
} as const;
export type SsoErrorCode = (typeof SSO_ERRORS)[keyof typeof SSO_ERRORS];

/**
 * Where an SSO sign-in started, sent by the browser as `additionalData` of signIn.social and kept in the
 * OAuth state. It is client-supplied, so it can only narrow what is allowed: `setup` is the only way to
 * create the first account, and `invite` requires the invitation's email to match.
 */
export type SsoIntent = { kind: 'signin' } | { kind: 'setup' } | { kind: 'invite'; invitationId: string };

/** The additionalData keys the screens send with signIn.social. */
export interface SsoIntentData {
  pmIntent: 'signin' | 'setup' | 'invite';
  pmInvitationId?: string;
  [key: string]: unknown;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Domain of the placeholder emails agents get (see @pm/core createAgent). */
const AGENT_EMAIL_DOMAIN = '@agents.invalid';

function trimSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

/** Name for a new account: the profile's name, then preferred_username, then the email's local part. */
function displayName(profile: GenericOAuthUserInfo): string {
  for (const key of ['name', 'preferred_username', 'nickname'] as const) {
    const value = profile[key];
    if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 100);
  }
  const email = typeof profile.email === 'string' ? profile.email : '';
  return email.split('@')[0] || 'New member';
}

/**
 * The provider is registered at /api/auth/oauth2/callback/oidc (the documented callback URL), while
 * Better Auth 1.7 serves OAuth callbacks at /api/auth/callback/:id. This rewrites the former to the latter.
 */
function oauth2CallbackAlias(): BetterAuthPlugin {
  return {
    id: 'pm-oauth2-callback-alias',
    onRequest: async (request) => {
      const url = new URL(request.url);
      const marker = `/oauth2/callback/${OIDC_PROVIDER_ID}`;
      if (!url.pathname.endsWith(marker)) return;
      url.pathname = `${url.pathname.slice(0, -marker.length)}/callback/${OIDC_PROVIDER_ID}`;
      return { request: new Request(url, request) };
    },
  };
}

/** Better Auth plugins for the configured provider. */
export function ssoPlugins(sso: SsoConfig, baseUrl: string): BetterAuthPlugin[] {
  return [
    genericOAuth({
      config: [
        {
          providerId: OIDC_PROVIDER_ID,
          name: sso.providerName,
          discoveryUrl: discoveryUrl(sso.issuer),
          // Only accept ID tokens checked against the provider's JWKS.
          requireIdTokenVerification: true,
          clientId: sso.clientId,
          clientSecret: sso.clientSecret,
          scopes: sso.scopes,
          pkce: true,
          redirectURI: `${trimSlash(baseUrl)}${OIDC_CALLBACK_PATH}`,
          // Signing out of this app does not sign people out of the provider (and their other apps).
          disableProviderLogout: true,
          // OIDC_TRUST_EMAIL=true: treat the provider's email as verified, so the verified-email rule (create,
          // link to an existing person, invitation match) accepts providers that never send email_verified.
          mapProfileToUser: (profile) => ({
            name: displayName(profile),
            ...(sso.trustEmail ? { emailVerified: true } : {}),
          }),
        },
      ],
    }),
    oauth2CallbackAlias(),
  ];
}

/** Account-linking options for SSO: link by the provider's verified email to an existing person. */
export const SSO_ACCOUNT_OPTIONS = {
  accountLinking: {
    enabled: true,
    // Accounts here are created by an admin (setup, invitations), without email verification, so the
    // provider's verification is what counts. Unverified provider emails never link (see the gate).
    requireLocalEmailVerified: false,
  },
} satisfies BetterAuthOptions['account'];

/** The groups claim as a list of group names. */
export function readGroups(profile: Record<string, unknown> | undefined, claim: string): string[] {
  const value = profile?.[claim];
  if (Array.isArray(value)) return value.filter((group): group is string => typeof group === 'string');
  if (typeof value === 'string' && value) return [value];
  return [];
}

async function readIntent(): Promise<SsoIntent> {
  const state = await getOAuthState<Partial<SsoIntentData>>().catch(() => null);
  if (state?.pmIntent === 'setup') return { kind: 'setup' };
  if (state?.pmIntent === 'invite') {
    return { kind: 'invite', invitationId: String(state.pmInvitationId ?? '') };
  }
  return { kind: 'signin' };
}

function refuse(code: SsoErrorCode, description: string): { error: string; errorDescription: string } {
  return { error: code, errorDescription: description };
}

type Refusal = ReturnType<typeof refuse>;

async function loadPendingInvitation(db: Db | Tx, invitationId: string) {
  if (!UUID.test(invitationId)) return null;
  const [row] = await db
    .select({
      id: schema.invitation.id,
      email: schema.invitation.email,
      role: schema.invitation.role,
      organizationId: schema.invitation.organizationId,
    })
    .from(schema.invitation)
    .where(
      and(
        eq(schema.invitation.id, invitationId),
        eq(schema.invitation.status, 'pending'),
        gt(schema.invitation.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** The newest pending, unexpired invitation for an email. */
async function findPendingInvitationFor(db: Db | Tx, email: string) {
  const [row] = await db
    .select({
      id: schema.invitation.id,
      email: schema.invitation.email,
      role: schema.invitation.role,
      organizationId: schema.invitation.organizationId,
    })
    .from(schema.invitation)
    .where(
      and(
        eq(sql`lower(${schema.invitation.email})`, email),
        eq(schema.invitation.status, 'pending'),
        gt(schema.invitation.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(schema.invitation.createdAt))
    .limit(1);
  return row ?? null;
}

async function oldestWorkspace(db: Db | Tx) {
  const [row] = await db
    .select({ id: schema.organization.id })
    .from(schema.organization)
    .orderBy(asc(schema.organization.createdAt))
    .limit(1);
  return row ?? null;
}

function isOwner(role: string): boolean {
  return role
    .split(',')
    .map((r) => r.trim())
    .includes('owner');
}

/** What the gate learned about an SSO sign-in, used when its session is created. */
interface SsoLogin {
  email: string;
  groups: string[];
  intent: SsoIntent;
}

export interface SsoGateOptions {
  db: Db;
  sso: SsoConfig;
  /** The open Better Auth transaction, if any (see createAuth): new users are checked inside it. */
  transactions: AsyncLocalStorage<Tx>;
}

/**
 * The rules for SSO identities, as Better Auth hooks:
 *
 * - `validateUserInfo` runs before an OAuth user is created, linked or signed in. It refuses unverified
 *   emails, agents, setup after the first person, invitation email mismatches, and in invite mode any
 *   new identity without a pending invitation.
 * - `beforeSessionCreate` runs once the user is known: it accepts the pending invitation or joins the
 *   workspace (auto mode), and applies OIDC_ADMIN_GROUPS.
 */
export function createSsoGate({ db, sso, transactions }: SsoGateOptions) {
  // Keyed by Better Auth's endpoint context, so the session hook of the same callback request finds it.
  const logins = new WeakMap<object, SsoLogin>();

  async function checkNewIdentity(email: string, intent: SsoIntent): Promise<Refusal | null> {
    // Better Auth creates the user and its account in one transaction; checking inside it with the same
    // advisory lock as bootstrapAdmin makes the first-run check race-free.
    const tx = transactions.getStore();
    if (!tx) throw new Error('SSO user creation ran outside a database transaction');
    if (await isFirstRun(tx)) {
      await tx.execute(sql`select pg_advisory_xact_lock(${BOOTSTRAP_LOCK_KEY})`);
    }
    if (await isFirstRun(tx)) {
      if (intent.kind === 'setup') return null;
      return refuse(SSO_ERRORS.notSetUp, 'This server is not set up yet. Open /setup to create the admin.');
    }
    if (intent.kind === 'setup') {
      return refuse(SSO_ERRORS.alreadySetUp, 'This server already has an admin. Sign in instead.');
    }
    if (!(await oldestWorkspace(tx))) {
      return refuse(SSO_ERRORS.notSetUp, 'This server is still being set up. Try again later.');
    }
    if (intent.kind === 'invite') return null; // Checked against the invitation already.
    if (await findPendingInvitationFor(tx, email)) return null;
    if (sso.signup === 'auto') return null;
    return refuse(
      SSO_ERRORS.noAccount,
      'There is no account for this email. Ask your admin for an invitation.',
    );
  }

  const validateUserInfo: NonNullable<NonNullable<BetterAuthOptions['user']>['validateUserInfo']> = async (
    data,
    ctx,
  ) => {
    const { source } = data;
    if (source.method !== 'oauth' || source.oauth?.providerId !== OIDC_PROVIDER_ID) return;

    const email = String(data.user.email ?? '')
      .trim()
      .toLowerCase();
    if (data.user.emailVerified !== true) {
      return refuse(SSO_ERRORS.emailNotVerified, 'Your SSO provider has not verified your email address.');
    }
    if (!email || email.endsWith(AGENT_EMAIL_DOMAIN)) {
      return refuse(SSO_ERRORS.accountNotAllowed, 'This account cannot sign in with SSO.');
    }

    const intent = await readIntent();
    if (intent.kind === 'invite') {
      const invitation = await loadPendingInvitation(transactions.getStore() ?? db, intent.invitationId);
      if (!invitation) {
        return refuse(SSO_ERRORS.invitationNotUsable, 'This invitation cannot be used any more.');
      }
      if (invitation.email.trim().toLowerCase() !== email) {
        return refuse(
          SSO_ERRORS.invitationEmailMismatch,
          'Your SSO account uses a different email address than the invitation.',
        );
      }
    }

    if (source.action === 'create-user') {
      if (data.user.kind !== undefined && data.user.kind !== 'person') {
        return refuse(SSO_ERRORS.accountNotAllowed, 'This account cannot sign in with SSO.');
      }
      const refusal = await checkNewIdentity(email, intent);
      if (refusal) return refusal;
    } else {
      // link-account and sign-in: the existing user must be a person. Agents are never matched or linked.
      const userId = typeof data.user.id === 'string' ? data.user.id : '';
      const [user] = userId
        ? await db
            .select({ kind: schema.user.kind })
            .from(schema.user)
            .where(eq(schema.user.id, userId))
            .limit(1)
        : [];
      if (user?.kind !== 'person') {
        return refuse(SSO_ERRORS.accountNotAllowed, 'This account cannot sign in with SSO.');
      }
    }

    logins.set(ctx, { email, groups: readGroups(source.oauth.profile, sso.groupsClaim), intent });
  };

  /** Joins the workspace when needed and syncs the role; throws an APIError to refuse the sign-in. */
  async function applyMembership(userId: string, login: SsoLogin): Promise<void> {
    await db.transaction(async (tx) => {
      const memberships = await tx
        .select({ id: schema.member.id, role: schema.member.role })
        .from(schema.member)
        .where(eq(schema.member.userId, userId));

      if (memberships.length === 0) {
        const workspace = await oldestWorkspace(tx);
        // Setup via SSO: the admin names the workspace in the next step.
        if (!workspace) return;

        const invitation =
          login.intent.kind === 'invite'
            ? await loadPendingInvitation(tx, login.intent.invitationId)
            : await findPendingInvitationFor(tx, login.email);
        if (invitation) {
          await tx
            .insert(schema.member)
            .values({ organizationId: invitation.organizationId, userId, role: invitation.role ?? 'member' })
            .onConflictDoNothing();
          await tx
            .update(schema.invitation)
            .set({ status: 'accepted' })
            .where(eq(schema.invitation.id, invitation.id));
        } else if (sso.signup === 'auto') {
          await tx
            .insert(schema.member)
            .values({ organizationId: workspace.id, userId, role: 'member' })
            .onConflictDoNothing();
        } else {
          throw new APIError('FORBIDDEN', {
            code: SSO_ERRORS.noAccount,
            message: 'You are not a member of this workspace. Ask your admin for an invitation.',
          });
        }
      }

      if (sso.adminGroups.length === 0) return;
      const role = login.groups.some((group) => sso.adminGroups.includes(group)) ? 'admin' : 'member';
      const current = await tx
        .select({ id: schema.member.id, role: schema.member.role })
        .from(schema.member)
        .where(eq(schema.member.userId, userId));
      for (const membership of current) {
        // Owners are never demoted or changed by the provider.
        if (isOwner(membership.role) || membership.role === role) continue;
        await tx.update(schema.member).set({ role }).where(eq(schema.member.id, membership.id));
      }
    });
  }

  async function beforeSessionCreate(session: { userId: string }, ctx: object | null | undefined) {
    const login = ctx ? logins.get(ctx) : undefined;
    if (!login) return;
    logins.delete(ctx as object);
    await applyMembership(session.userId, login);
  }

  return { validateUserInfo, beforeSessionCreate };
}
