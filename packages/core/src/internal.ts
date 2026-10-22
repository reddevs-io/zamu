// Helpers shared by services. Not part of the public API.
import { TaskKeyInput, type UserRef } from '@pm/contracts';
import { type DbOrTx, schema } from '@pm/db';
import { and, eq, inArray } from 'drizzle-orm';
import { type Actor, authorize } from './authz';
import { NotFound, parseInput } from './errors';

export type UserRow = Pick<typeof schema.user.$inferSelect, 'id' | 'name' | 'kind' | 'responsibleUserId'>;

export function userRef(row: Pick<UserRow, 'id' | 'name' | 'kind'>): UserRef {
  return { id: row.id, name: row.name, kind: row.kind };
}

/** Loads users by id; missing ids are left out of the map. */
export async function loadUsers(db: DbOrTx, ids: Iterable<string>): Promise<Map<string, UserRow>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = await db
    .select({
      id: schema.user.id,
      name: schema.user.name,
      kind: schema.user.kind,
      responsibleUserId: schema.user.responsibleUserId,
    })
    .from(schema.user)
    .where(inArray(schema.user.id, unique));
  return new Map(rows.map((row) => [row.id, row]));
}

/** Timestamps from raw SQL may arrive as strings; normalise to Date. */
export function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

export type ProjectRow = typeof schema.project.$inferSelect;
export type TaskRow = typeof schema.task.$inferSelect;

/**
 * The project with `key` in the actor's workspace. NotFound when it does not exist; Forbidden
 * when the actor's key does not cover it.
 */
export async function findProjectByKey(
  db: DbOrTx,
  actor: Actor,
  key: string,
  options: { forUpdate?: boolean } = {},
): Promise<ProjectRow> {
  const query = db
    .select()
    .from(schema.project)
    .where(and(eq(schema.project.workspaceId, actor.workspaceId), eq(schema.project.key, key)))
    .limit(1);
  const [row] = options.forUpdate ? await query.for('update') : await query;
  if (!row) throw new NotFound(`Project ${key} not found`);
  authorize(actor, 'project.read', { type: 'project', projectId: row.id });
  return row;
}

/** A member of the workspace with their role, or null when `userId` is not a member. */
export async function workspaceMember(db: DbOrTx, workspaceId: string, userId: string) {
  const [row] = await db
    .select({
      id: schema.user.id,
      name: schema.user.name,
      kind: schema.user.kind,
      responsibleUserId: schema.user.responsibleUserId,
      role: schema.member.role,
    })
    .from(schema.member)
    .innerJoin(schema.user, eq(schema.user.id, schema.member.userId))
    .where(and(eq(schema.member.organizationId, workspaceId), eq(schema.member.userId, userId)))
    .limit(1);
  return row ?? null;
}

/** The project and task rows for a task key, after the read check. NotFound for unknown keys. */
export async function findTask(
  db: DbOrTx,
  actor: Actor,
  key: string,
  options: { forUpdate?: boolean } = {},
): Promise<{ project: ProjectRow; task: TaskRow }> {
  const canonical = parseInput(TaskKeyInput, key);
  const [projectKey, numberText] = canonical.split('-') as [string, string];
  const projectRow = await findProjectByKey(db, actor, projectKey).catch((error: unknown) => {
    if (error instanceof NotFound) throw new NotFound(`Task ${canonical} not found`);
    throw error;
  });
  const query = db
    .select()
    .from(schema.task)
    .where(and(eq(schema.task.projectId, projectRow.id), eq(schema.task.number, Number(numberText))))
    .limit(1);
  const [row] = options.forUpdate ? await query.for('update') : await query;
  if (!row) throw new NotFound(`Task ${canonical} not found`);
  return { project: projectRow, task: row };
}
