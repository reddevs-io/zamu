import { apiKey } from '@better-auth/api-key';
import type { BetterAuthOptions } from 'better-auth';
import { organization } from 'better-auth/plugins/organization';
import type { SsoConfig } from './config';
import { SSO_ACCOUNT_OPTIONS, ssoPlugins } from './sso';

/** Prefix of every API key, so keys are recognisable in logs and secret scanners. */
export const API_KEY_PREFIX = 'pm_live_';

/** Minimum password length, shared with the setup and invitation forms. */
export const MIN_PASSWORD_LENGTH = 12;

/** Invitations expire after 7 days (Better Auth counts seconds). */
export const INVITATION_EXPIRES_IN_SECONDS = 7 * 24 * 60 * 60;

/** Kinds of user: people sign in with a password or SSO, agents act through API keys only. */
export const USER_KINDS = ['person', 'agent'] as const;
export type UserKind = (typeof USER_KINDS)[number];

/**
 * Better Auth plugins. Shared by createAuth and by the CLI config that generates the Drizzle schema, so both
 * see the same tables. The SSO plugins add no tables (OIDC identities live in `account`).
 */
export function authPlugins({ sso, baseUrl }: { sso?: SsoConfig | null; baseUrl?: string } = {}) {
  return [
    // Workspaces. Invitations are shared as copyable links in M1, so no email is sent.
    organization({
      allowUserToCreateOrganization: false,
      invitationExpiresIn: INVITATION_EXPIRES_IN_SECONDS,
      cancelPendingInvitationsOnReInvite: true,
      sendInvitationEmail: async (data) => {
        console.info(`[auth] invitation ${data.id} created for ${data.organization.name}; no email sent`);
      },
    }),
    // API keys owned by a user. Scope lives in metadata: { workspaceId, projects, access }.
    // The plain key is only returned by createApiKey; the database stores a hash.
    apiKey({
      defaultPrefix: API_KEY_PREFIX,
      enableMetadata: true,
      requireName: true,
      maximumNameLength: 100,
      // Keep the first 12 characters ("pm_live_4kQz") so keys can be told apart in lists.
      startingCharactersConfig: { shouldStore: true, charactersLength: 12 },
      // The plugin defaults to 10 requests per day per key, which would break agents and the CLI.
      rateLimit: { enabled: false },
      // Keys never turn into Better Auth sessions; getActorFromRequest resolves them instead.
      enableSessionForAPIKeys: false,
    }),
    // Single sign-on with one OpenID Connect provider, when OIDC_* is configured (see config.ts, sso.ts).
    ...(sso && baseUrl ? ssoPlugins(sso, baseUrl) : []),
  ];
}

/** Better Auth options without the database adapter and hooks (see createAuth). */
export function authOptions({
  secret,
  baseUrl,
  sso = null,
}: {
  secret: string;
  baseUrl: string;
  sso?: SsoConfig | null;
}) {
  return {
    appName: 'project-management',
    secret,
    baseURL: baseUrl,
    emailAndPassword: {
      enabled: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
    },
    user: {
      additionalFields: {
        // input: false keeps both fields out of sign-up and update-user payloads.
        kind: {
          type: ['person', 'agent'],
          required: false,
          defaultValue: 'person',
          input: false,
        },
        responsibleUserId: {
          type: 'string',
          required: false,
          input: false,
          references: { model: 'user', field: 'id', onDelete: 'set null' },
        },
      },
    },
    advanced: {
      // Postgres generates ids (uuidv7() defaults in the checked-in schema).
      database: { generateId: 'uuid' },
    },
    ...(sso ? { account: SSO_ACCOUNT_OPTIONS } : {}),
    telemetry: { enabled: false },
    plugins: authPlugins({ sso, baseUrl }),
  } satisfies BetterAuthOptions;
}
