// Members (people and agents), agent creation and member removal.
import {
  type ApiKeyCreated,
  CreateAgentInput,
  Member,
  type MemberList,
  UserId,
  type UserRef,
  type WorkspaceRole,
} from '@pm/contracts';
import { type DbOrTx, schema } from '@pm/db';
import { and, asc, eq, inArray, max, sql } from 'drizzle-orm';
import { z } from 'zod';
import { activeKeyCounts, issueApiKey, MAX_API_KEY_NAME_LENGTH, validateScope } from './api-keys';
import { type Actor, authorize } from './authz';
import type { AuthContext, DbContext } from './context';
import { Conflict, Forbidden, Invalid, NotFound, parseInput } from './errors';
import { loadUsers, userRef, workspaceMember } from './internal';

const { activity, apikey, member, user } = schema;

/** Better Auth stores several roles comma-separated; the strongest wins. */
export function toWorkspaceRole(role: string | null | undefined): WorkspaceRole {
  const roles = (role ?? '').split(',').map((r) => r.trim());
  if (roles.includes('owner')) return 'owner';
  if (roles.includes('admin')) return 'admin';
  return 'member';
}

/** Domain of the synthetic, never-shown email addresses of agents (RFC 2606 reserves .invalid). */
export const AGENT_EMAIL_DOMAIN = 'agents.invalid';

/** Members of `workspaceId`, optionally limited to `userIds`, people first, then by name. */
async function loadMembers(db: DbOrTx, workspaceId: string, userIds?: string[]): Promise<Member[]> {
  const rows = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      kind: user.kind,
      responsibleUserId: user.responsibleUserId,
      role: member.role,
      joinedAt: member.createdAt,
    })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(and(eq(member.organizationId, workspaceId), userIds ? inArray(user.id, userIds) : undefined))
    .orderBy(sql`${user.kind} = 'agent'`, asc(user.name), asc(user.id));
  const ids = rows.map((row) => row.id);

  const [responsible, lastActive, keyCounts] = await Promise.all([
    loadUsers(
      db,
      rows.map((row) => row.responsibleUserId).filter((id): id is string => id !== null),
    ),
    ids.length
      ? db
          .select({ actorId: activity.actorId, at: max(activity.createdAt) })
          .from(activity)
          .where(and(eq(activity.workspaceId, workspaceId), inArray(activity.actorId, ids)))
          .groupBy(activity.actorId)
      : Promise.resolve([]),
    activeKeyCounts(db, workspaceId, ids),
  ]);
  const lastActiveById = new Map(lastActive.map((row) => [row.actorId, row.at]));

  return rows.map((row) => {
    const responsibleRow = row.responsibleUserId ? responsible.get(row.responsibleUserId) : undefined;
    const at = lastActiveById.get(row.id);
    return Member.parse({
      id: row.id,
      name: row.name,
      email: row.kind === 'agent' ? null : row.email,
      kind: row.kind,
      role: toWorkspaceRole(row.role),
      responsible: row.kind === 'agent' && responsibleRow ? userRef(responsibleRow) : null,
      lastActiveAt: at ? new Date(at) : null,
      apiKeyCount: keyCounts.get(row.id) ?? 0,
      joinedAt: row.joinedAt,
    });
  });
}

/** People and agents of the actor's workspace, with responsible humans, last activity and key counts. */
export async function listMembers({ db }: DbContext, actor: Actor): Promise<MemberList> {
  authorize(actor, 'workspace.read');
  return { items: await loadMembers(db, actor.workspaceId) };
}

/** One member of the actor's workspace. NotFound when the user is not a member. */
export async function getMember({ db }: DbContext, actor: Actor, userId: string): Promise<Member> {
  authorize(actor, 'workspace.read');
  const [found] = await loadMembers(db, actor.workspaceId, [parseInput(UserId, userId)]);
  if (!found) throw new NotFound('Member not found');
  return found;
}

export interface AgentCreated {
  agent: Member;
  /** The agent's first API key, with its secret. Shown once. */
  key: ApiKeyCreated;
}

function defaultKeyName(agentName: string): string {
  return `${agentName} key`.slice(0, MAX_API_KEY_NAME_LENGTH);
}

/**
 * Adds an agent: a user of kind agent without a password, its membership and its first API key.
 * Admins only. The responsible human must be a person in the workspace; agent names are unique
 * per workspace. Returns the key secret once.
 */
export async function createAgent(
  ctx: AuthContext,
  actor: Actor,
  input: z.input<typeof CreateAgentInput>,
): Promise<AgentCreated> {
  const parsed = parseInput(CreateAgentInput, input);
  authorize(actor, 'member.manage');
  const { db } = ctx;

  const responsible = await workspaceMember(db, actor.workspaceId, parsed.responsibleUserId);
  if (responsible?.kind !== 'person') {
    throw new Invalid('The responsible human must be a person in this workspace', {
      issues: [{ path: 'responsibleUserId', message: 'Pick a person from this workspace' }],
    });
  }
  const keyName = parsed.keyName ?? defaultKeyName(parsed.name);
  if (keyName.length > MAX_API_KEY_NAME_LENGTH) {
    throw new Invalid(`Key names are limited to ${MAX_API_KEY_NAME_LENGTH} characters`, {
      issues: [{ path: 'keyName', message: `Use ${MAX_API_KEY_NAME_LENGTH} characters or fewer` }],
    });
  }
  await validateScope(db, actor.workspaceId, parsed.scope);

  const agentId = await db.transaction(async (tx) => {
    // Serialise agent creation per workspace and name, so the uniqueness check holds.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`agent:${actor.workspaceId}:${parsed.name}`}))`,
    );
    const [existing] = await tx
      .select({ id: user.id })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(
        and(eq(member.organizationId, actor.workspaceId), eq(user.kind, 'agent'), eq(user.name, parsed.name)),
      )
      .limit(1);
    if (existing) throw new Conflict(`An agent named ${parsed.name} already exists in this workspace`);

    const [created] = await tx
      .insert(user)
      .values({
        name: parsed.name,
        email: `${parsed.name}.${crypto.randomUUID()}@${AGENT_EMAIL_DOMAIN}`,
        emailVerified: false,
        kind: 'agent',
        responsibleUserId: responsible.id,
      })
      .returning({ id: user.id });
    if (!created) throw new Error('agent insert returned no row');
    await tx.insert(member).values({ organizationId: actor.workspaceId, userId: created.id, role: 'member' });
    return created.id;
  });

  // Better Auth writes the key on its own connection, so it runs after the agent is committed;
  // if it fails, the agent is removed again rather than left without a key.
  let key: ApiKeyCreated;
  try {
    key = await issueApiKey(ctx, actor.workspaceId, agentId, keyName, parsed.scope);
  } catch (error) {
    await db.delete(user).where(eq(user.id, agentId));
    throw error;
  }
  const [agent] = await loadMembers(db, actor.workspaceId, [agentId]);
  if (!agent) throw new Error('created agent could not be read back');
  return { agent, key };
}

export const RemoveMemberInput = z.object({ userId: UserId });
export type RemoveMemberInput = z.output<typeof RemoveMemberInput>;

/**
 * Removes a person or agent from the workspace. Admins only; owners and yourself cannot be removed.
 * An agent's keys are revoked too. Authored tasks and activity stay.
 */
export async function removeMember(
  { db }: DbContext,
  actor: Actor,
  input: z.input<typeof RemoveMemberInput>,
): Promise<UserRef> {
  const { userId } = parseInput(RemoveMemberInput, input);
  authorize(actor, 'member.manage');
  if (userId === actor.userId) throw new Invalid('You cannot remove yourself from the workspace');
  return db.transaction(async (tx) => {
    const target = await workspaceMember(tx, actor.workspaceId, userId);
    if (!target) throw new NotFound('Member not found');
    if (toWorkspaceRole(target.role) === 'owner')
      throw new Forbidden('The workspace owner cannot be removed');
    await tx
      .delete(member)
      .where(and(eq(member.organizationId, actor.workspaceId), eq(member.userId, userId)));
    if (target.kind === 'agent') {
      await tx.update(apikey).set({ enabled: false }).where(eq(apikey.referenceId, userId));
    }
    return userRef(target);
  });
}
