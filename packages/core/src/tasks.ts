// Tasks: list, get by key, create, update. Every write records activity in the same transaction.
import {
  ASSIGNEE_AGENTS,
  ASSIGNEE_ME,
  CreateTaskInput,
  DEFAULT_TASK_PRIORITY,
  DEFAULT_TASK_STATUS,
  formatTaskKey,
  GetTaskInput,
  ListTasksInput,
  type Priority,
  priorityFromValue,
  priorityToValue,
  TASK_STATUSES,
  Task,
  TaskListPage,
  type TaskStatus,
  UpdateTaskInput,
} from '@pm/contracts';
import { type DbOrTx, schema, type Tx } from '@pm/db';
import { and, asc, desc, eq, ilike, inArray, or, type SQL, sql } from 'drizzle-orm';
import { z } from 'zod';
import { recordActivity, type StoredChange } from './activity';
import { type Actor, authorize } from './authz';
import type { DbContext } from './context';
import { Invalid, NotFound, parseInput } from './errors';
import {
  findProjectByKey,
  findTask,
  loadUsers,
  type ProjectRow,
  type TaskRow,
  type UserRow,
  userRef,
  workspaceMember,
} from './internal';

const { project, task, user } = schema;

// ---------------------------------------------------------------------------
// Mapping rows to contract shapes
// ---------------------------------------------------------------------------

function assigneeRef(id: string | null, users: Map<string, UserRow>) {
  if (!id) return null;
  const row = users.get(id);
  if (!row) return null;
  const responsible = row.responsibleUserId ? users.get(row.responsibleUserId) : undefined;
  return { ...userRef(row), responsible: responsible ? userRef(responsible) : null };
}

/** Loads the users with `ids`, plus the responsible humans of the agents among them. */
async function usersFor(db: DbOrTx, ids: (string | null)[]) {
  const users = await loadUsers(
    db,
    ids.filter((id): id is string => id !== null),
  );
  const responsibleIds = [...users.values()]
    .map((row) => row.responsibleUserId)
    .filter((id): id is string => id !== null && !users.has(id));
  for (const [id, row] of await loadUsers(db, responsibleIds)) users.set(id, row);
  return users;
}

function requireUser(users: Map<string, UserRow>, id: string) {
  const row = users.get(id);
  if (!row) throw new Error(`user ${id} referenced by a task does not exist`);
  return userRef(row);
}

async function toTask(db: DbOrTx, projectRow: ProjectRow, row: TaskRow): Promise<Task> {
  const users = await usersFor(db, [row.assigneeId, row.createdById, row.createdOnBehalfOfId]);
  return Task.parse({
    id: row.id,
    key: formatTaskKey(projectRow.key, row.number),
    number: row.number,
    project: { id: projectRow.id, key: projectRow.key, name: projectRow.name },
    title: row.title,
    description: row.description,
    status: row.status,
    priority: priorityFromValue(row.priority),
    assignee: assigneeRef(row.assigneeId, users),
    createdBy: requireUser(users, row.createdById),
    createdOnBehalfOf: row.createdOnBehalfOfId ? requireUser(users, row.createdOnBehalfOfId) : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

// ---------------------------------------------------------------------------
// Cursor
// ---------------------------------------------------------------------------

/** Position after the last row of a page, in list order (status, priority desc, updated_at desc, id desc). */
const Cursor = z.tuple([
  z.enum(TASK_STATUSES),
  z.number().int().min(0).max(4),
  /** updated_at as Postgres text, so microseconds survive the round trip. */
  z.string().min(1).max(64),
  z.uuid(),
]);
type Cursor = z.infer<typeof Cursor>;

function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

function decodeCursor(value: string): Cursor {
  try {
    const cursor = Cursor.parse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')));
    if (Number.isNaN(Date.parse(cursor[2]))) throw new Error('bad timestamp');
    return cursor;
  } catch {
    throw new Invalid('The cursor is not valid', { issues: [{ path: 'cursor', message: 'Invalid cursor' }] });
  }
}

function afterCursor([status, priority, updatedAt, id]: Cursor): SQL {
  const sameStatus = sql`${task.status} = ${status}::task_status`;
  const samePriority = eq(task.priority, priority);
  const sameUpdatedAt = sql`${task.updatedAt} = ${updatedAt}::timestamptz`;
  return or(
    sql`${task.status} > ${status}::task_status`,
    and(sameStatus, sql`${task.priority} < ${priority}`),
    and(sameStatus, samePriority, sql`${task.updatedAt} < ${updatedAt}::timestamptz`),
    and(sameStatus, samePriority, sameUpdatedAt, sql`${task.id} < ${id}::uuid`),
  ) as SQL;
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * One page of a project's tasks in grouped order: status, then priority (highest first), then
 * last update (newest first). `counts` covers every status for the same filters, ignoring the
 * status filter, so the UI can show group sizes.
 */
export async function listTasks(
  { db }: DbContext,
  actor: Actor,
  input: z.input<typeof ListTasksInput>,
): Promise<TaskListPage> {
  const filters = parseInput(ListTasksInput, input);
  const projectRow = await findProjectByKey(db, actor, filters.project);
  const cursor = filters.cursor ? decodeCursor(filters.cursor) : null;

  const conditions: (SQL | undefined)[] = [eq(task.projectId, projectRow.id)];
  if (filters.priority) conditions.push(inArray(task.priority, filters.priority.map(priorityToValue)));
  if (filters.assignee === ASSIGNEE_ME) conditions.push(eq(task.assigneeId, actor.userId));
  else if (filters.assignee === ASSIGNEE_AGENTS) {
    conditions.push(
      inArray(task.assigneeId, db.select({ id: user.id }).from(user).where(eq(user.kind, 'agent'))),
    );
  } else if (filters.assignee) conditions.push(eq(task.assigneeId, filters.assignee));
  if (filters.q) {
    const pattern = `%${escapeLike(filters.q)}%`;
    conditions.push(
      or(ilike(task.title, pattern), ilike(sql`${projectRow.key} || '-' || ${task.number}::text`, pattern)),
    );
  }
  const statusCondition = filters.status ? inArray(task.status, filters.status) : undefined;

  const [rows, countRows] = await Promise.all([
    db
      .select({ task, updatedAtText: sql<string>`${task.updatedAt}::text` })
      .from(task)
      .where(and(...conditions, statusCondition, cursor ? afterCursor(cursor) : undefined))
      .orderBy(asc(task.status), desc(task.priority), desc(task.updatedAt), desc(task.id))
      .limit(filters.limit + 1),
    db
      .select({ status: task.status, count: sql<number>`count(*)`.mapWith(Number) })
      .from(task)
      .where(and(...conditions))
      .groupBy(task.status),
  ]);

  const page = rows.slice(0, filters.limit);
  const last = page.at(-1);
  const nextCursor =
    rows.length > filters.limit && last
      ? encodeCursor([last.task.status, last.task.priority, last.updatedAtText, last.task.id])
      : null;

  const users = await usersFor(
    db,
    page.map((row) => row.task.assigneeId),
  );
  const counts = Object.fromEntries(TASK_STATUSES.map((status) => [status, 0])) as Record<TaskStatus, number>;
  for (const row of countRows) counts[row.status] = row.count;

  return TaskListPage.parse({
    items: page.map(({ task: row }) => ({
      id: row.id,
      key: formatTaskKey(projectRow.key, row.number),
      number: row.number,
      title: row.title,
      status: row.status,
      priority: priorityFromValue(row.priority),
      assignee: assigneeRef(row.assigneeId, users),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    })),
    nextCursor,
    counts,
  });
}

// ---------------------------------------------------------------------------
// Get
// ---------------------------------------------------------------------------

/** A task by key, e.g. PAY-142. NotFound outside the workspace; Forbidden outside the key's scope. */
export async function getTask({ db }: DbContext, actor: Actor, input: z.input<typeof GetTaskInput>) {
  const { key } = parseInput(GetTaskInput, input);
  const found = await findTask(db, actor, key);
  return toTask(db, found.project, found.task);
}

// ---------------------------------------------------------------------------
// Create and update
// ---------------------------------------------------------------------------

/** Resolves `me` or a user id to a workspace member's id. Invalid when the user is not a member. */
async function resolveAssignee(tx: Tx, actor: Actor, value: string | null | undefined) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const id = value === ASSIGNEE_ME ? actor.userId : value;
  if (id === actor.userId) return id;
  const member = await workspaceMember(tx, actor.workspaceId, id);
  if (!member) {
    throw new Invalid('The assignee is not a member of this workspace', {
      issues: [{ path: 'assignee', message: 'Not a member of this workspace' }],
    });
  }
  return id;
}

/** Creates a task. Its number comes from the project counter in the same transaction. */
export async function createTask(
  { db }: DbContext,
  actor: Actor,
  input: z.input<typeof CreateTaskInput>,
): Promise<Task> {
  const parsed = parseInput(CreateTaskInput, input);
  return db.transaction(async (tx) => {
    const projectRow = await findProjectByKey(tx, actor, parsed.project);
    authorize(actor, 'task.write', { type: 'project', projectId: projectRow.id });
    const assigneeId = (await resolveAssignee(tx, actor, parsed.assignee)) ?? null;

    // Row lock on the project: concurrent creations queue here and each gets the next number.
    const [counter] = await tx
      .update(project)
      .set({ nextTaskNumber: sql`${project.nextTaskNumber} + 1`, updatedAt: sql`${project.updatedAt}` })
      .where(eq(project.id, projectRow.id))
      .returning({ number: sql<number>`${project.nextTaskNumber} - 1`.mapWith(Number) });
    if (!counter) throw new NotFound(`Project ${projectRow.key} not found`);

    const description = parsed.description ? parsed.description : null;
    const [row] = await tx
      .insert(task)
      .values({
        projectId: projectRow.id,
        number: counter.number,
        title: parsed.title,
        description,
        status: parsed.status,
        priority: priorityToValue(parsed.priority),
        assigneeId,
        createdById: actor.userId,
        createdOnBehalfOfId: actor.onBehalfOfId,
      })
      .returning();
    if (!row) throw new Error('task insert returned no row');

    // task.created lists the title and every initial value that differs from the defaults.
    const changes: StoredChange[] = [{ field: 'title', from: null, to: row.title }];
    if (description !== null) changes.push({ field: 'description', from: null, to: description });
    if (parsed.status !== DEFAULT_TASK_STATUS)
      changes.push({ field: 'status', from: null, to: parsed.status });
    if (parsed.priority !== DEFAULT_TASK_PRIORITY) {
      changes.push({ field: 'priority', from: null, to: parsed.priority });
    }
    if (assigneeId) changes.push({ field: 'assignee', from: null, to: assigneeId });
    await recordActivity(tx, actor, {
      projectId: projectRow.id,
      taskId: row.id,
      type: 'task.created',
      changes,
    });

    return toTask(tx, projectRow, row);
  });
}

/** Updates the fields that differ from the stored task and records them as one task.updated entry. */
export async function updateTask(
  { db }: DbContext,
  actor: Actor,
  input: z.input<typeof UpdateTaskInput>,
): Promise<Task> {
  const parsed = parseInput(UpdateTaskInput, input);
  return db.transaction(async (tx) => {
    const { project: projectRow, task: current } = await findTask(tx, actor, parsed.key, { forUpdate: true });
    authorize(actor, 'task.write', { type: 'project', projectId: projectRow.id });

    const set: Partial<typeof task.$inferInsert> = {};
    const changes: StoredChange[] = [];
    if (parsed.title !== undefined && parsed.title !== current.title) {
      set.title = parsed.title;
      changes.push({ field: 'title', from: current.title, to: parsed.title });
    }
    if (parsed.description !== undefined) {
      const description = parsed.description ? parsed.description : null;
      if (description !== current.description) {
        set.description = description;
        changes.push({ field: 'description', from: current.description, to: description });
      }
    }
    if (parsed.status !== undefined && parsed.status !== current.status) {
      set.status = parsed.status;
      changes.push({ field: 'status', from: current.status, to: parsed.status });
    }
    if (parsed.priority !== undefined) {
      const value = priorityToValue(parsed.priority);
      if (value !== current.priority) {
        set.priority = value;
        const from: Priority = priorityFromValue(current.priority);
        changes.push({ field: 'priority', from, to: parsed.priority });
      }
    }
    const assigneeId = await resolveAssignee(tx, actor, parsed.assignee);
    if (assigneeId !== undefined && assigneeId !== current.assigneeId) {
      set.assigneeId = assigneeId;
      changes.push({ field: 'assignee', from: current.assigneeId, to: assigneeId });
    }

    if (changes.length === 0) return toTask(tx, projectRow, current);

    const [row] = await tx.update(task).set(set).where(eq(task.id, current.id)).returning();
    if (!row) throw new Error('task update returned no row');
    await recordActivity(tx, actor, {
      projectId: projectRow.id,
      taskId: row.id,
      type: 'task.updated',
      changes,
    });
    return toTask(tx, projectRow, row);
  });
}
