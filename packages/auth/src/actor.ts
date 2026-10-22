import { type Db, schema } from '@pm/db';
import { and, asc, eq } from 'drizzle-orm';
import { type ApiKeyAccess, parseApiKeyMetadata } from './api-key';
import type { Auth } from './auth';
import { API_KEY_PREFIX, type UserKind } from './options';

export type WorkspaceRole = 'owner' | 'admin' | 'member';

/** Who is making a request, resolved from a session cookie or an API key. */
export interface Actor {
  userId: string;
  kind: UserKind;
  workspaceId: string;
  /** Membership role in workspaceId. Owner and admin both count as admin. */
  role: WorkspaceRole;
  /** Present for API-key requests only; sessions act with the user's full rights. */
  scope?: { projects: 'all' | string[]; access: ApiKeyAccess };
  /** The responsible human for agents, null for people. Recorded on activity. */
  onBehalfOfId: string | null;
  /** The API key used, for audit; absent for session requests. */
  apiKeyId?: string;
}

/** The pm_live_ key from `Authorization: Bearer ...`, or null. */
export function bearerApiKey(headers: Headers): string | null {
  const header = headers.get('authorization');
  if (!header) return null;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header);
  const token = match?.[1];
  return token?.startsWith(API_KEY_PREFIX) ? token : null;
}

function asRole(role: string): WorkspaceRole {
  // Better Auth stores multiple roles comma-separated; take the strongest.
  const roles = role.split(',').map((r) => r.trim());
  if (roles.includes('owner')) return 'owner';
  if (roles.includes('admin')) return 'admin';
  return 'member';
}

async function loadUser(db: Db, userId: string) {
  const [row] = await db
    .select({ id: schema.user.id, kind: schema.user.kind, responsibleUserId: schema.user.responsibleUserId })
    .from(schema.user)
    .where(eq(schema.user.id, userId))
    .limit(1);
  return row ?? null;
}

/** Membership of `userId`, in `workspaceId` when given, otherwise the oldest one. */
async function loadMembership(db: Db, userId: string, workspaceId: string | null) {
  const [row] = await db
    .select({ organizationId: schema.member.organizationId, role: schema.member.role })
    .from(schema.member)
    .where(
      workspaceId
        ? and(eq(schema.member.userId, userId), eq(schema.member.organizationId, workspaceId))
        : eq(schema.member.userId, userId),
    )
    .orderBy(asc(schema.member.createdAt))
    .limit(1);
  return row ?? null;
}

function onBehalfOf(user: { kind: UserKind; responsibleUserId: string | null }): string | null | undefined {
  if (user.kind === 'person') return null;
  // An agent without a responsible human has nobody to act for; refuse it.
  return user.responsibleUserId ?? undefined;
}

/**
 * Resolves the actor of a request: `Authorization: Bearer pm_live_...` first, then the session cookie.
 * Returns null when the request is not authenticated, the key is invalid, disabled or expired, or the
 * user is not a member of the workspace. Agents never act through a session.
 */
export async function getActorFromRequest(
  { auth, db }: { auth: Auth; db: Db },
  request: Request | { headers: Headers },
): Promise<Actor | null> {
  const headers = request.headers;
  const key = bearerApiKey(headers);

  if (key) {
    let verified: Awaited<ReturnType<Auth['api']['verifyApiKey']>>;
    try {
      verified = await auth.api.verifyApiKey({ body: { key } });
    } catch {
      return null;
    }
    if (!verified.valid || !verified.key) return null;
    const metadata = parseApiKeyMetadata(verified.key.metadata);
    if (!metadata) return null;

    const user = await loadUser(db, verified.key.referenceId);
    if (!user) return null;
    const behalf = onBehalfOf(user);
    if (behalf === undefined) return null;
    const membership = await loadMembership(db, user.id, metadata.workspaceId);
    if (!membership) return null;

    return {
      userId: user.id,
      kind: user.kind,
      workspaceId: membership.organizationId,
      role: asRole(membership.role),
      scope: { projects: metadata.projects, access: metadata.access },
      onBehalfOfId: behalf,
      apiKeyId: verified.key.id,
    };
  }

  const session = await auth.api.getSession({ headers });
  if (!session) return null;
  const user = await loadUser(db, session.user.id);
  if (user?.kind !== 'person') return null;
  // The organization plugin adds activeOrganizationId at runtime, but Better Auth 1.7 only types it
  // when teams or dynamic access control are enabled.
  const { activeOrganizationId } = session.session as { activeOrganizationId?: string | null };
  const membership =
    (activeOrganizationId && (await loadMembership(db, user.id, activeOrganizationId))) ||
    (await loadMembership(db, user.id, null));
  if (!membership) return null;

  return {
    userId: user.id,
    kind: user.kind,
    workspaceId: membership.organizationId,
    role: asRole(membership.role),
    onBehalfOfId: null,
  };
}
