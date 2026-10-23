// Tasks: list, get by key, create, update. Every write records activity in the same transaction.
import {
  ASSIGNEE_AGENTS,
  ASSIGNEE_ME,
  CreateTaskInput,
  type CycleSelector,
  DEFAULT_TASK_PRIORITY,
  DEFAULT_TASK_STATUS,
  FILTER_NONE,
  formatTaskKey,
  GetTaskInput,
  ListTasksInput,
  type Priority,
  parseTaskKey,
  priorityFromValue,
  priorityToValue,
  TASK_STATUS_LABELS,
  TASK_STATUSES,
  Task,
  TaskListPage,
  type TaskPosition,
  type TaskStatus,
  UpdateTaskInput,
} from '@pm/contracts';
import { type DbOrTx, schema, type Tx } from '@pm/db';
import { and, asc, desc, eq, ilike, inArray, isNull, ne, or, type SQL, sql } from 'drizzle-orm';
import { z } from 'zod';
import { recordActivity, type StoredChange } from './activity';
import { type Actor, authorize } from './authz';
import type { DbContext } from './context';
import { type ClockContext, type CycleRow, cycleStateOn, resolveCycleSelector, todayIn } from './cycles';
import { Invalid, NotFound, parseInput, TaskChanged } from './errors';
import {
  findProjectByKey,
  findTask,
  loadUsers,
  type MilestoneRow,
  type ProjectRow,
  readableProjects,
  type TaskRow,
  type UserRow,
  userRef,
  workspaceMember,
} from './internal';
import { activateMilestoneForTask } from './milestones';

const { cycle, milestone, project, task, user } = schema;
type TaskInsert = typeof task.$inferInsert;

/** Context of the task services: the database plus the optional clock that dates cycles. */
export type TaskContext = DbContext & ClockContext;

/** Statuses that count as started: moving a task into one activates its milestone. */
const STARTED_STATUSES: ReadonlySet<TaskStatus> = new Set(['in_progress', 'in_review']);

/** Below this gap between two neighbouring ranks, a board column is renumbered 1..n. */
export const MIN_RANK_GAP = 1e-9;

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

type PlanningRow = Pick<TaskRow, 'milestoneId' | 'cycleId'>;

/** Milestone and cycle references of `rows`, in two queries. Cycle states are derived for `today`. */
async function planningRefs(db: DbOrTx, rows: PlanningRow[], today: string) {
  const milestoneIds = [...new Set(rows.map((row) => row.milestoneId).filter((id) => id !== null))];
  const cycleIds = [...new Set(rows.map((row) => row.cycleId).filter((id) => id !== null))];
  // Sequential: inside a transaction both queries share one connection.
  const milestones =
    milestoneIds.length === 0
      ? []
      : await db
          .select({
            id: milestone.id,
            name: milestone.name,
            status: milestone.status,
            targetDate: milestone.targetDate,
          })
          .from(milestone)
          .where(inArray(milestone.id, milestoneIds));
  const cycles =
    cycleIds.length === 0
      ? []
      : await db
          .select({
            id: cycle.id,
            number: cycle.number,
            name: cycle.name,
            startsOn: cycle.startsOn,
            endsOn: cycle.endsOn,
            completedAt: cycle.completedAt,
          })
          .from(cycle)
          .where(inArray(cycle.id, cycleIds));
  const milestoneById = new Map(milestones.map((row) => [row.id, row]));
  const cycleById = new Map(
    cycles.map(({ completedAt, ...row }) => [
      row.id,
      { ...row, state: cycleStateOn({ ...row, completedAt }, today) },
    ]),
  );
  return {
    milestone: (row: PlanningRow) => (row.milestoneId ? (milestoneById.get(row.milestoneId) ?? null) : null),
    cycle: (row: PlanningRow) => (row.cycleId ? (cycleById.get(row.cycleId) ?? null) : null),
  };
}

async function toTask(db: DbOrTx, projectRow: ProjectRow, row: TaskRow, today: string): Promise<Task> {
  // Sequential: toTask runs inside transactions, where queries share one connection.
  const users = await usersFor(db, [row.assigneeId, row.createdById, row.createdOnBehalfOfId]);
  const refs = await planningRefs(db, [row], today);
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
    milestone: refs.milestone(row),
    cycle: refs.cycle(row),
    cycleAddedAt: row.cycleAddedAt,
    rank: row.rank,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

// ---------------------------------------------------------------------------
// Cursor
// ---------------------------------------------------------------------------

/** Position after the last row of a page in list order (status, priority desc, updated_at desc, id desc). */
const ListCursor = z.tuple([
  z.enum(TASK_STATUSES),
  z.number().int().min(0).max(4),
  /** updated_at as Postgres text, so microseconds survive the round trip. */
  z.string().min(1).max(64),
  z.uuid(),
]);
/** Position after the last row of a page in board order (status, rank, id). */
const BoardCursor = z.tuple([z.literal('board'), z.enum(TASK_STATUSES), z.number(), z.uuid()]);
const Cursor = z.union([ListCursor, BoardCursor]);
type ListCursor = z.infer<typeof ListCursor>;
type BoardCursor = z.infer<typeof BoardCursor>;
type Cursor = z.infer<typeof Cursor>;

function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

function invalidCursor(): Invalid {
  return new Invalid('The cursor is not valid', { issues: [{ path: 'cursor', message: 'Invalid cursor' }] });
}

function decodeCursor(value: string, order: 'list' | 'board'): Cursor {
  let cursor: Cursor;
  try {
    cursor = Cursor.parse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')));
  } catch {
    throw invalidCursor();
  }
  const isBoard = cursor[0] === 'board';
  if (isBoard !== (order === 'board')) throw invalidCursor();
  if (!isBoard && Number.isNaN(Date.parse((cursor as ListCursor)[2]))) throw invalidCursor();
  return cursor;
}

function afterListCursor([status, priority, updatedAt, id]: ListCursor): SQL {
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

function afterBoardCursor([, status, rank, id]: BoardCursor): SQL {
  return or(
    sql`${task.status} > ${status}::task_status`,
    and(
      sql`${task.status} = ${status}::task_status`,
      sql`(${task.rank}, ${task.id}) > (${rank}::double precision, ${id}::uuid)`,
    ),
  ) as SQL;
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** Ids of the cycles `selector` names in each project; projects without such a cycle add none. */
async function cycleIdsFor(
  ctx: TaskContext,
  projects: ProjectRow[],
  selector: CycleSelector,
): Promise<string[]> {
  const { db } = ctx;
  const projectIds = projects.map((row) => row.id);
  if (typeof selector === 'number') {
    const rows = await db
      .select({ id: cycle.id })
      .from(cycle)
      .where(and(inArray(cycle.projectId, projectIds), eq(cycle.number, selector)));
    return rows.map((row) => row.id);
  }
  // current and next resolve per project.
  const found = await Promise.all(projects.map((row) => resolveCycleSelector(db, row.id, selector, ctx)));
  return found.filter((row) => row !== null).map((row) => row.id);
}

/**
 * One page of tasks in list order (status, then priority highest first, then last update newest
 * first) or board order (status, then rank). Without `project`, the page spans every project the
 * actor can read in the workspace. `counts` covers every status for the same filters, ignoring the
 * status filter, so the UI can show group sizes.
 */
export async function listTasks(
  ctx: TaskContext,
  actor: Actor,
  input: z.input<typeof ListTasksInput>,
): Promise<TaskListPage> {
  const { db } = ctx;
  const filters = parseInput(ListTasksInput, input);
  const cursor = filters.cursor ? decodeCursor(filters.cursor, filters.order) : null;
  const projects = await readableProjects(db, actor, filters.project);
  const counts = Object.fromEntries(TASK_STATUSES.map((status) => [status, 0])) as Record<TaskStatus, number>;
  if (projects.length === 0) return TaskListPage.parse({ items: [], nextCursor: null, counts });

  const conditions: (SQL | undefined)[] = [
    inArray(
      task.projectId,
      projects.map((row) => row.id),
    ),
  ];
  if (filters.priority) conditions.push(inArray(task.priority, filters.priority.map(priorityToValue)));
  if (filters.assignee === ASSIGNEE_ME) conditions.push(eq(task.assigneeId, actor.userId));
  else if (filters.assignee === ASSIGNEE_AGENTS) {
    conditions.push(
      inArray(task.assigneeId, db.select({ id: user.id }).from(user).where(eq(user.kind, 'agent'))),
    );
  } else if (filters.assignee) conditions.push(eq(task.assigneeId, filters.assignee));
  if (filters.milestone === FILTER_NONE) conditions.push(isNull(task.milestoneId));
  else if (filters.milestone) conditions.push(eq(task.milestoneId, filters.milestone));
  if (filters.cycle === FILTER_NONE) conditions.push(isNull(task.cycleId));
  else if (filters.cycle !== undefined) {
    const ids = await cycleIdsFor(ctx, projects, filters.cycle);
    // No such cycle anywhere: nothing matches.
    conditions.push(ids.length === 0 ? sql`false` : inArray(task.cycleId, ids));
  }
  if (filters.q) {
    const pattern = `%${escapeLike(filters.q)}%`;
    conditions.push(
      or(ilike(task.title, pattern), ilike(sql`${project.key} || '-' || ${task.number}::text`, pattern)),
    );
  }
  const statusCondition = filters.status ? inArray(task.status, filters.status) : undefined;
  const board = filters.order === 'board';
  const after = cursor
    ? cursor[0] === 'board'
      ? afterBoardCursor(cursor as BoardCursor)
      : afterListCursor(cursor as ListCursor)
    : undefined;

  const [rows, countRows] = await Promise.all([
    db
      .select({
        task,
        project: { id: project.id, key: project.key, name: project.name },
        updatedAtText: sql<string>`${task.updatedAt}::text`,
      })
      .from(task)
      .innerJoin(project, eq(project.id, task.projectId))
      .where(and(...conditions, statusCondition, after))
      .orderBy(
        ...(board
          ? [asc(task.status), asc(task.rank), asc(task.id)]
          : [asc(task.status), desc(task.priority), desc(task.updatedAt), desc(task.id)]),
      )
      .limit(filters.limit + 1),
    db
      .select({ status: task.status, count: sql<number>`count(*)`.mapWith(Number) })
      .from(task)
      .innerJoin(project, eq(project.id, task.projectId))
      .where(and(...conditions))
      .groupBy(task.status),
  ]);

  const page = rows.slice(0, filters.limit);
  const last = page.at(-1);
  let nextCursor: string | null = null;
  if (rows.length > filters.limit && last) {
    nextCursor = encodeCursor(
      board
        ? ['board', last.task.status, last.task.rank, last.task.id]
        : [last.task.status, last.task.priority, last.updatedAtText, last.task.id],
    );
  }

  const [users, refs] = await Promise.all([
    usersFor(
      db,
      page.map((row) => row.task.assigneeId),
    ),
    planningRefs(
      db,
      page.map((row) => row.task),
      todayIn(ctx),
    ),
  ]);
  for (const row of countRows) counts[row.status] = row.count;

  return TaskListPage.parse({
    items: page.map(({ task: row, project: projectRef }) => ({
      id: row.id,
      key: formatTaskKey(projectRef.key, row.number),
      number: row.number,
      project: projectRef,
      title: row.title,
      status: row.status,
      priority: priorityFromValue(row.priority),
      assignee: assigneeRef(row.assigneeId, users),
      milestone: refs.milestone(row),
      cycle: refs.cycle(row),
      cycleAddedAt: row.cycleAddedAt,
      rank: row.rank,
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
export async function getTask(ctx: TaskContext, actor: Actor, input: z.input<typeof GetTaskInput>) {
  const { key } = parseInput(GetTaskInput, input);
  const found = await findTask(ctx.db, actor, key);
  return toTask(ctx.db, found.project, found.task, todayIn(ctx));
}

// ---------------------------------------------------------------------------
// Validation of task fields
// ---------------------------------------------------------------------------

function invalidField(path: string, message: string): Invalid {
  return new Invalid(message, { issues: [{ path, message }] });
}

/** Resolves `me` or a user id to a workspace member's id. Invalid when the user is not a member. */
async function resolveAssignee(tx: Tx, actor: Actor, value: string | null | undefined) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const id = value === ASSIGNEE_ME ? actor.userId : value;
  if (id === actor.userId) return id;
  const member = await workspaceMember(tx, actor.workspaceId, id);
  if (!member) throw invalidField('assignee', 'The assignee is not a member of this workspace');
  return id;
}

/**
 * Checks a milestone id against the task's project: the project must use milestones and the
 * milestone must belong to it. null clears.
 */
async function resolveMilestone(
  tx: Tx,
  projectRow: ProjectRow,
  value: string | null | undefined,
): Promise<MilestoneRow | null | undefined> {
  if (value === undefined || value === null) return value;
  if (!projectRow.usesMilestones) {
    throw invalidField('milestone', `Project ${projectRow.key} does not use milestones`);
  }
  const [row] = await tx
    .select()
    .from(milestone)
    .where(and(eq(milestone.id, value), eq(milestone.projectId, projectRow.id)))
    .limit(1);
  if (!row) throw invalidField('milestone', `The milestone is not in project ${projectRow.key}`);
  return row;
}

/**
 * Resolves a cycle selector in the task's project: the project must use cycles, the cycle must
 * exist and must not be completed. null clears.
 */
async function resolveCycle(
  tx: Tx,
  clock: ClockContext,
  projectRow: ProjectRow,
  value: CycleSelector | null | undefined,
): Promise<CycleRow | null | undefined> {
  if (value === undefined || value === null) return value;
  if (!projectRow.usesCycles) throw invalidField('cycle', `Project ${projectRow.key} does not use cycles`);
  const row = await resolveCycleSelector(tx, projectRow.id, value, clock);
  if (!row) {
    const message =
      typeof value === 'number'
        ? `Cycle ${value} does not exist in project ${projectRow.key}`
        : `Project ${projectRow.key} has no ${value === 'current' ? 'current' : 'upcoming'} cycle`;
    throw invalidField('cycle', message);
  }
  // Completed includes a cycle past its end date that the hourly job has not ended yet.
  if (row.state === 'completed') {
    throw invalidField('cycle', `Cycle ${row.number} is completed and takes no new tasks`);
  }
  return row;
}

// ---------------------------------------------------------------------------
// Ranks
// ---------------------------------------------------------------------------

/** Rank for the top of a status column: the column minimum - 1, or 0 for an empty column. */
async function topRank(tx: Tx, projectId: string, status: TaskStatus, excludeId?: string): Promise<number> {
  const [row] = await tx
    .select({ min: sql<number | string | null>`min(${task.rank})` })
    .from(task)
    .where(
      and(
        eq(task.projectId, projectId),
        eq(task.status, status),
        excludeId ? ne(task.id, excludeId) : undefined,
      ),
    );
  return row?.min === null || row?.min === undefined ? 0 : Number(row.min) - 1;
}

/**
 * Renumbers a status column 1..n in board order (rank, id), leaving out `excludeId` (the task being
 * moved). Raw SQL on purpose: renumbering is not a change of those tasks, so their updated_at stays.
 */
async function renumberColumn(tx: Tx, projectId: string, status: TaskStatus, excludeId: string) {
  await tx.execute(sql`
    update ${task} set rank = ordered.n
    from (
      select id, row_number() over (order by rank, id) as n
      from ${task}
      where project_id = ${projectId} and status = ${status}::task_status and id <> ${excludeId}
    ) as ordered
    where ${task.id} = ordered.id`);
}

/**
 * Rank that places `movingId` right before or after the reference task of `position` in the
 * `status` column: the midpoint between the reference and its neighbour on that side, or one step
 * past the reference at the column's end. Renumbers the column when the gap is too small.
 * The caller holds the project row lock.
 */
async function rankForPosition(
  tx: Tx,
  projectRow: ProjectRow,
  movingId: string,
  status: TaskStatus,
  position: TaskPosition,
): Promise<number> {
  const before = 'before' in position;
  const refKey = before ? position.before : position.after;
  const path = before ? 'position.before' : 'position.after';
  const { projectKey, number } = parseTaskKey(refKey);
  if (projectKey !== projectRow.key) {
    throw invalidField(path, `${refKey} is not in project ${projectRow.key}`);
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    const [ref] = await tx
      .select({ id: task.id, rank: task.rank, status: task.status })
      .from(task)
      .where(and(eq(task.projectId, projectRow.id), eq(task.number, number)))
      .limit(1);
    if (!ref) throw invalidField(path, `Task ${refKey} not found`);
    if (ref.id === movingId) throw invalidField(path, 'A task cannot be placed next to itself');
    if (ref.status !== status) {
      throw invalidField(path, `${refKey} is not in the ${TASK_STATUS_LABELS[status]} column`);
    }

    const refTuple = sql`(${ref.rank}::double precision, ${ref.id}::uuid)`;
    const [neighbour] = await tx
      .select({ rank: task.rank })
      .from(task)
      .where(
        and(
          eq(task.projectId, projectRow.id),
          eq(task.status, status),
          ne(task.id, movingId),
          before
            ? sql`(${task.rank}, ${task.id}) < ${refTuple}`
            : sql`(${task.rank}, ${task.id}) > ${refTuple}`,
        ),
      )
      .orderBy(...(before ? [desc(task.rank), desc(task.id)] : [asc(task.rank), asc(task.id)]))
      .limit(1);
    if (!neighbour) return before ? ref.rank - 1 : ref.rank + 1;

    const mid = (ref.rank + neighbour.rank) / 2;
    const gap = Math.abs(ref.rank - neighbour.rank);
    if (gap >= MIN_RANK_GAP && mid !== ref.rank && mid !== neighbour.rank) return mid;
    await renumberColumn(tx, projectRow.id, status, movingId);
  }
  throw new Error('board column renumbering did not open a gap');
}

// ---------------------------------------------------------------------------
// Create and update
// ---------------------------------------------------------------------------

/**
 * Creates a task at the top of its status column. Its number comes from the project counter in
 * the same transaction. A milestone and a cycle of the same project may be set; a started task
 * activates its milestone.
 */
export async function createTask(
  ctx: TaskContext,
  actor: Actor,
  input: z.input<typeof CreateTaskInput>,
): Promise<Task> {
  const parsed = parseInput(CreateTaskInput, input);
  return ctx.db.transaction(async (tx) => {
    // Row lock on the project first: concurrent creations queue here and each gets the next number
    // and a rank above the column's current top; a cycle cannot end while the task joins it.
    const projectRow = await findProjectByKey(tx, actor, parsed.project, { forUpdate: true });
    authorize(actor, 'task.write', { type: 'project', projectId: projectRow.id });
    const assigneeId = (await resolveAssignee(tx, actor, parsed.assignee)) ?? null;
    const milestoneRow = (await resolveMilestone(tx, projectRow, parsed.milestone)) ?? null;
    const cycleRow = (await resolveCycle(tx, ctx, projectRow, parsed.cycle)) ?? null;

    const [counter] = await tx
      .update(project)
      .set({ nextTaskNumber: sql`${project.nextTaskNumber} + 1`, updatedAt: sql`${project.updatedAt}` })
      .where(eq(project.id, projectRow.id))
      .returning({ number: sql<number>`${project.nextTaskNumber} - 1`.mapWith(Number) });
    if (!counter) throw new NotFound(`Project ${projectRow.key} not found`);
    const rank = await topRank(tx, projectRow.id, parsed.status);

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
        milestoneId: milestoneRow?.id ?? null,
        cycleId: cycleRow?.id ?? null,
        cycleAddedAt: cycleRow ? sql`now()` : null,
        rank,
      })
      .returning();
    if (!row) throw new Error('task insert returned no row');

    if (milestoneRow && STARTED_STATUSES.has(row.status)) await activateMilestoneForTask(tx, milestoneRow.id);

    // task.created lists the title and every initial value that differs from the defaults.
    const changes: StoredChange[] = [{ field: 'title', from: null, to: row.title }];
    if (description !== null) changes.push({ field: 'description', from: null, to: description });
    if (parsed.status !== DEFAULT_TASK_STATUS)
      changes.push({ field: 'status', from: null, to: parsed.status });
    if (parsed.priority !== DEFAULT_TASK_PRIORITY) {
      changes.push({ field: 'priority', from: null, to: parsed.priority });
    }
    if (assigneeId) changes.push({ field: 'assignee', from: null, to: assigneeId });
    if (milestoneRow) changes.push({ field: 'milestone', from: null, to: milestoneRow.id });
    if (cycleRow) changes.push({ field: 'cycle', from: null, to: cycleRow.id });
    await recordActivity(tx, actor, {
      projectId: projectRow.id,
      taskId: row.id,
      type: 'task.created',
      changes,
    });

    return toTask(tx, projectRow, row, todayIn(ctx));
  });
}

/**
 * Updates the fields that differ from the stored task and records them as one task.updated entry.
 * - ifUpdatedAt: TaskChanged (409, with the current task) when the stored task is newer, compared
 *   at millisecond precision.
 * - position places the task before or after a task of the target column (the new status when
 *   status changes); a status change without position puts it at the top of the new column.
 *   Rank is not recorded as activity.
 * - A task that ends up started (In progress, In review) after a status or milestone change
 *   activates its milestone.
 */
export async function updateTask(
  ctx: TaskContext,
  actor: Actor,
  input: z.input<typeof UpdateTaskInput>,
): Promise<Task> {
  const parsed = parseInput(UpdateTaskInput, input);
  const today = todayIn(ctx);
  return ctx.db.transaction(async (tx) => {
    // Rank changes may renumber the column, and ending a cycle moves tasks under the project lock:
    // take it first for those changes (see findTask).
    const lockProject =
      parsed.status !== undefined || parsed.position !== undefined || parsed.cycle !== undefined;
    const { project: projectRow, task: current } = await findTask(tx, actor, parsed.key, {
      forUpdate: true,
      lockProject,
    });
    authorize(actor, 'task.write', { type: 'project', projectId: projectRow.id });

    if (parsed.ifUpdatedAt) {
      const [check] = await tx
        .select({
          stale: sql<boolean>`date_trunc('milliseconds', ${task.updatedAt}) > ${parsed.ifUpdatedAt}::timestamptz`,
        })
        .from(task)
        .where(eq(task.id, current.id));
      if (check?.stale) throw new TaskChanged(await toTask(tx, projectRow, current, today));
    }

    const set: Partial<TaskInsert> = {};
    /** now() of the transaction when the cycle changes, null when it is cleared. */
    let cycleAddedAt: SQL | null | undefined;
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
    if (parsed.milestone !== undefined && parsed.milestone !== current.milestoneId) {
      const milestoneRow = await resolveMilestone(tx, projectRow, parsed.milestone);
      const milestoneId = milestoneRow?.id ?? null;
      set.milestoneId = milestoneId;
      changes.push({ field: 'milestone', from: current.milestoneId, to: milestoneId });
    }
    if (parsed.cycle !== undefined) {
      // Same cycle again is no change, even when that cycle has completed since.
      const unchanged =
        parsed.cycle === null
          ? current.cycleId === null
          : current.cycleId !== null && (await sameCycle(tx, current.cycleId, parsed.cycle));
      if (!unchanged) {
        const cycleRow = await resolveCycle(tx, ctx, projectRow, parsed.cycle);
        const cycleId = cycleRow?.id ?? null;
        if (cycleId !== current.cycleId) {
          set.cycleId = cycleId;
          cycleAddedAt = cycleId ? sql`now()` : null;
          changes.push({ field: 'cycle', from: current.cycleId, to: cycleId });
        }
      }
    }

    const status = set.status ?? current.status;
    if (parsed.position) {
      set.rank = await rankForPosition(tx, projectRow, current.id, status, parsed.position);
    } else if (set.status !== undefined) {
      set.rank = await topRank(tx, projectRow.id, status, current.id);
    }

    if (Object.keys(set).length === 0) return toTask(tx, projectRow, current, today);

    const [row] = await tx
      .update(task)
      .set(cycleAddedAt === undefined ? set : { ...set, cycleAddedAt })
      .where(eq(task.id, current.id))
      .returning();
    if (!row) throw new Error('task update returned no row');
    const startedOrMoved = set.status !== undefined || set.milestoneId !== undefined;
    if (row.milestoneId && startedOrMoved && STARTED_STATUSES.has(row.status)) {
      await activateMilestoneForTask(tx, row.milestoneId);
    }
    if (changes.length > 0) {
      await recordActivity(tx, actor, {
        projectId: projectRow.id,
        taskId: row.id,
        type: 'task.updated',
        changes,
      });
    }
    return toTask(tx, projectRow, row, today);
  });
}

/** Whether `selector` names the cycle `cycleId` already points at, without resolving current/next. */
async function sameCycle(tx: Tx, cycleId: string, selector: CycleSelector): Promise<boolean> {
  if (typeof selector !== 'number') return false;
  const [row] = await tx.select({ number: cycle.number }).from(cycle).where(eq(cycle.id, cycleId)).limit(1);
  return row?.number === selector;
}
