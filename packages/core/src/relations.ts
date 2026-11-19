// M5 task relations: blockers ("blocked by" links), parents and subtasks, plus the errors of the
// new task fields. Rules from section 2 of the M5 plan and "The four new fields" of the M5 brief:
// - Blockers and parents are tasks of the same project (NotSameProject otherwise).
// - Blocker links never loop. The check walks the existing links with a recursive CTE; callers
//   hold the project lock, so two links added at once can't close a loop between them.
// - Subtasks go one level deep: a parent can't be a subtask, and a task with subtasks can't become
//   one (SubtaskDepth). Callers hold the project lock for parent changes too.
// - A task is blocked while any blocker is open (not Done or Canceled) and not hidden. Display
//   only: status changes are never refused.
// - Subtask progress is done of total over visible subtasks, canceled ones left out of both.
import {
  formatTaskKey,
  OPEN_TASK_STATUSES,
  type ProblemCode,
  type RelatedTask,
  type SubtaskProgress,
  splitTaskKey,
  type TaskStatus,
} from '@zamu/contracts';
import { type DbOrTx, schema, type Tx } from '@zamu/db';
import { and, eq, inArray, isNull, ne, type SQL, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { compareTaskKeys, type StoredTaskRef } from './activity';
import { Conflict, type CoreError, Invalid } from './errors';
import { loadUsers, type ProjectRow, type TaskRow, userRef } from './internal';

const { task, taskDependency } = schema;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------
//
// The M5 problem codes travel on subclasses of Conflict and Invalid: CoreErrorCode in errors.ts
// does not list them yet. Adapters read the contract code with problemCodeOf(). Once errors.ts
// gains these codes, the classes can move there and set `code` directly.

/** A label name the project has already, ignoring case (409 LABEL_EXISTS). */
export class LabelExists extends Conflict {
  readonly problemCode = 'LABEL_EXISTS' as const;
}

/** Renaming or deleting a label that comes from Backlog.md files (409 LABEL_MIRRORED). */
export class LabelMirrored extends Conflict {
  readonly problemCode = 'LABEL_MIRRORED' as const;
}

/**
 * A blocker that would close a loop (409 DEPENDENCY_LOOP). `loop` names the two ends: `blocker`
 * already waits on `task` (directly or through other tasks), so `task` can't wait on `blocker`.
 * The message is the sentence the UI shows: "Can't add: PAY-150 already waits on PAY-142."
 */
export class DependencyLoop extends Conflict {
  readonly problemCode = 'DEPENDENCY_LOOP' as const;
  readonly loop: { task: string; blocker: string };

  constructor(loop: { task: string; blocker: string }, path = 'addBlockers') {
    const message = `Can't add: ${loop.blocker} already waits on ${loop.task}.`;
    super(message, { issues: [{ path, message }] });
    this.loop = loop;
  }
}

/** A parent that is a subtask, or a task with subtasks becoming one (409 SUBTASK_DEPTH). */
export class SubtaskDepth extends Conflict {
  readonly problemCode = 'SUBTASK_DEPTH' as const;
}

/** A blocker, parent, or bulk milestone and cycle across projects (422 NOT_SAME_PROJECT). */
export class NotSameProject extends Invalid {
  readonly problemCode = 'NOT_SAME_PROJECT' as const;
}

/** The contract code of a core error: the M5 code for the classes above, else `error.code`. */
export function problemCodeOf(error: CoreError): ProblemCode {
  const extra = (error as { problemCode?: unknown }).problemCode;
  return typeof extra === 'string' ? (extra as ProblemCode) : error.code;
}

function invalidField(path: string, message: string): Invalid {
  return new Invalid(message, { issues: [{ path, message }] });
}

// ---------------------------------------------------------------------------
// SQL fragments
// ---------------------------------------------------------------------------

const OPEN_STATUS_LIST = sql.join(
  OPEN_TASK_STATUSES.map((status) => sql`${status}::task_status`),
  sql`, `,
);

/**
 * True when the task with id `taskId` (a column or value) has an open, visible blocker. Usable in
 * WHERE clauses of queries on `task`: the inner table is aliased so it can't capture the outer one.
 */
export function hasOpenBlockerSql(taskId: SQL | typeof task.id): SQL {
  return sql`exists (
    select 1 from ${taskDependency} as dep
    join ${task} as blocker on blocker.id = dep.blocker_id
    where dep.task_id = ${taskId}
      and blocker.status in (${OPEN_STATUS_LIST})
      and blocker.hidden_at is null
  )`;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** A task as relation lists need it. */
type RelatedRow = Pick<
  TaskRow,
  'id' | 'number' | 'keySuffix' | 'title' | 'status' | 'assigneeId' | 'hiddenAt' | 'parentId'
>;

const relatedColumns = {
  id: task.id,
  number: task.number,
  keySuffix: task.keySuffix,
  title: task.title,
  status: task.status,
  assigneeId: task.assigneeId,
  hiddenAt: task.hiddenAt,
  parentId: task.parentId,
};

/** The ids among `taskIds` with an open, visible blocker. One query. */
export async function blockedTaskIds(db: DbOrTx, taskIds: string[]): Promise<Set<string>> {
  if (taskIds.length === 0) return new Set();
  const rows = await db
    .selectDistinct({ id: taskDependency.taskId })
    .from(taskDependency)
    .innerJoin(task, eq(task.id, taskDependency.blockerId))
    .where(
      and(
        inArray(taskDependency.taskId, taskIds),
        inArray(task.status, [...OPEN_TASK_STATUSES]),
        isNull(task.hiddenAt),
      ),
    );
  return new Set(rows.map((row) => row.id));
}

/**
 * Subtask progress of the tasks in `taskIds` that have visible, not canceled subtasks; the others
 * are left out (read them as { done: 0, total: 0 }). One grouped query.
 */
export async function subtaskProgressOf(
  db: DbOrTx,
  taskIds: string[],
): Promise<Map<string, SubtaskProgress>> {
  if (taskIds.length === 0) return new Map();
  const rows = await db
    .select({
      parentId: task.parentId,
      done: sql<number>`count(*) filter (where ${task.status} = 'done')`.mapWith(Number),
      total: sql<number>`count(*)`.mapWith(Number),
    })
    .from(task)
    .where(and(inArray(task.parentId, taskIds), ne(task.status, 'canceled'), isNull(task.hiddenAt)))
    .groupBy(task.parentId);
  return new Map(
    rows.flatMap((row) =>
      row.parentId ? [[row.parentId, { done: row.done, total: row.total }] as const] : [],
    ),
  );
}

/** Keys of the tasks in `ids` (parents of a page), by id. One query. */
export async function taskKeysById(db: DbOrTx, ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = await db
    .select({ id: task.id, number: task.number, keySuffix: task.keySuffix, projectKey: schema.project.key })
    .from(task)
    .innerJoin(schema.project, eq(schema.project.id, task.projectId))
    .where(inArray(task.id, unique));
  return new Map(rows.map((row) => [row.id, formatTaskKey(row.projectKey, row.number, row.keySuffix)]));
}

/** What a task view shows about the task's relations (Task.parent, subtasks, blockedBy, ...). */
export interface TaskRelations {
  parent: z.input<typeof RelatedTask> | null;
  subtasks: z.input<typeof RelatedTask>[];
  subtaskProgress: SubtaskProgress;
  blockedBy: (z.input<typeof RelatedTask> | null)[];
  blocks: (z.input<typeof RelatedTask> | null)[];
  blocked: boolean;
}

/**
 * The relations of one task: its parent, subtasks (by key, canceled included, hidden left out),
 * blockers and the tasks it blocks (by key; hidden ones become null, "Removed task"). Five queries.
 */
export async function loadTaskRelations(
  db: DbOrTx,
  projectRow: ProjectRow,
  row: TaskRow,
): Promise<TaskRelations> {
  // Sequential: inside a transaction the queries share one connection.
  const parentRows = row.parentId
    ? await db.select(relatedColumns).from(task).where(eq(task.id, row.parentId)).limit(1)
    : [];
  const subtaskRows = await db.select(relatedColumns).from(task).where(eq(task.parentId, row.id));
  const blockerRows = await db
    .select(relatedColumns)
    .from(taskDependency)
    .innerJoin(task, eq(task.id, taskDependency.blockerId))
    .where(eq(taskDependency.taskId, row.id));
  const blocksRows = await db
    .select(relatedColumns)
    .from(taskDependency)
    .innerJoin(task, eq(task.id, taskDependency.taskId))
    .where(eq(taskDependency.blockerId, row.id));

  const all = [...parentRows, ...subtaskRows, ...blockerRows, ...blocksRows];
  const users = await loadUsers(
    db,
    all.flatMap((item) => (item.assigneeId ? [item.assigneeId] : [])),
  );
  const keyOf = (item: RelatedRow) => formatTaskKey(projectRow.key, item.number, item.keySuffix);
  const related = (item: RelatedRow): z.input<typeof RelatedTask> => {
    const assignee = item.assigneeId ? users.get(item.assigneeId) : undefined;
    return {
      key: keyOf(item),
      title: item.title,
      status: item.status,
      assignee: assignee ? userRef(assignee) : null,
    };
  };
  const byKey = (a: RelatedRow, b: RelatedRow) => compareTaskKeys(keyOf(a), keyOf(b));
  const visibleOrNull = (item: RelatedRow) => (item.hiddenAt === null ? related(item) : null);

  const subtasks = subtaskRows.filter((item) => item.hiddenAt === null).sort(byKey);
  const counted = subtasks.filter((item) => item.status !== 'canceled');
  const [parentRow] = parentRows;
  return {
    parent: parentRow ? related(parentRow) : null,
    subtasks: subtasks.map(related),
    subtaskProgress: { done: counted.filter((item) => item.status === 'done').length, total: counted.length },
    blockedBy: blockerRows.sort(byKey).map(visibleOrNull),
    blocks: blocksRows.sort(byKey).map(visibleOrNull),
    blocked: blockerRows.some((item) => item.hiddenAt === null && isOpen(item.status)),
  };
}

function isOpen(status: TaskStatus): boolean {
  return (OPEN_TASK_STATUSES as readonly string[]).includes(status);
}

// ---------------------------------------------------------------------------
// Writes: resolving keys and checking the rules
// ---------------------------------------------------------------------------

/** A task of the project, found by app key, as relation writes need it. */
export type ProjectTask = Pick<TaskRow, 'id' | 'number' | 'keySuffix' | 'title' | 'parentId' | 'assigneeId'>;

/** The stored reference of a task in activity changes. */
export function storedTaskRef(projectRow: Pick<ProjectRow, 'key'>, row: ProjectTask): StoredTaskRef {
  return { id: row.id, key: formatTaskKey(projectRow.key, row.number, row.keySuffix), title: row.title };
}

/**
 * The tasks with app keys `keys` in `projectRow`, in the order given. NotSameProject for a key of
 * another project; Invalid for a key the project doesn't have. `path` names the input field.
 */
export async function resolveProjectTasks(
  tx: DbOrTx,
  projectRow: Pick<ProjectRow, 'id' | 'key'>,
  keys: string[],
  path: string,
): Promise<ProjectTask[]> {
  if (keys.length === 0) return [];
  const wanted = keys.map((key) => {
    const parts = splitTaskKey(key);
    if (!parts) throw invalidField(path, `${key} is not a task key`);
    if (parts.projectKey !== projectRow.key) {
      const what = path === 'parent' ? 'A parent task' : 'Blockers';
      throw new NotSameProject(`${what} must be in ${projectRow.key}, and ${key} is not`, {
        issues: [{ path, message: `${key} is in another project` }],
      });
    }
    return { key, number: parts.number, suffix: parts.suffix };
  });
  const rows = await tx
    .select({
      id: task.id,
      number: task.number,
      keySuffix: task.keySuffix,
      title: task.title,
      parentId: task.parentId,
      assigneeId: task.assigneeId,
    })
    .from(task)
    .where(
      and(eq(task.projectId, projectRow.id), inArray(task.number, [...new Set(wanted.map((w) => w.number))])),
    );
  return wanted.map((item) => {
    const found = rows.find((row) => row.number === item.number && row.keySuffix === item.suffix);
    if (!found) throw invalidField(path, `Task ${item.key} not found`);
    return found;
  });
}

/**
 * Throws DependencyLoop when `blocker` already waits on `waiting`, directly or through other tasks,
 * and Invalid when they are the same task. Walks blocker links from `blocker` with a recursive CTE;
 * UNION (not UNION ALL) drops ids already visited, so loops already in the data (Backlog.md files,
 * detached mirrors) end the walk instead of running forever.
 * Call under the project lock, before inserting the link.
 */
export async function assertNoDependencyLoop(
  tx: Tx,
  projectRow: Pick<ProjectRow, 'key'>,
  waiting: ProjectTask,
  blocker: ProjectTask,
  path = 'addBlockers',
): Promise<void> {
  const waitingKey = formatTaskKey(projectRow.key, waiting.number, waiting.keySuffix);
  if (waiting.id === blocker.id) throw invalidField(path, `${waitingKey} can't wait on itself`);
  const result = await tx.execute<{ loops: boolean }>(sql`
    with recursive chain(id) as (
      select blocker_id from ${taskDependency} where task_id = ${blocker.id}
      union
      select dep.blocker_id from ${taskDependency} as dep join chain on dep.task_id = chain.id
    )
    select exists (select 1 from chain where id = ${waiting.id}) as loops`);
  if (result.rows[0]?.loops) {
    throw new DependencyLoop(
      { task: waitingKey, blocker: formatTaskKey(projectRow.key, blocker.number, blocker.keySuffix) },
      path,
    );
  }
}

/**
 * Checks that `child` (null for a task being created) may become a subtask of `parent`: not
 * itself, the parent is top level, and the child has no subtasks. Call under the project lock.
 */
export async function assertParentAllowed(
  tx: Tx,
  projectRow: Pick<ProjectRow, 'key'>,
  child: ProjectTask | null,
  parent: ProjectTask,
): Promise<void> {
  const parentKey = formatTaskKey(projectRow.key, parent.number, parent.keySuffix);
  if (child && child.id === parent.id) throw invalidField('parent', `${parentKey} can't be its own parent`);
  if (parent.parentId !== null) {
    throw new SubtaskDepth(`${parentKey} is a subtask itself. Subtasks go one level deep.`, {
      issues: [{ path: 'parent', message: `${parentKey} is a subtask` }],
    });
  }
  if (!child) return;
  const [hasChildren] = await tx
    .select({ id: task.id })
    .from(task)
    .where(eq(task.parentId, child.id))
    .limit(1);
  if (hasChildren) {
    const childKey = formatTaskKey(projectRow.key, child.number, child.keySuffix);
    throw new SubtaskDepth(`${childKey} has subtasks, so it can't become one. Subtasks go one level deep.`, {
      issues: [{ path: 'parent', message: `${childKey} has subtasks` }],
    });
  }
}

/** The blockers `taskId` waits on now, as project tasks. */
export async function loadBlockers(tx: DbOrTx, taskId: string): Promise<ProjectTask[]> {
  return tx
    .select({
      id: task.id,
      number: task.number,
      keySuffix: task.keySuffix,
      title: task.title,
      parentId: task.parentId,
      assigneeId: task.assigneeId,
    })
    .from(taskDependency)
    .innerJoin(task, eq(task.id, taskDependency.blockerId))
    .where(eq(taskDependency.taskId, taskId));
}

/** Adds the links "`taskId` waits on each of `blockerIds`". Existing links are kept. */
export async function insertBlockers(tx: Tx, taskId: string, blockerIds: string[]): Promise<void> {
  if (blockerIds.length === 0) return;
  await tx
    .insert(taskDependency)
    .values(blockerIds.map((blockerId) => ({ taskId, blockerId })))
    .onConflictDoNothing();
}

/** Drops the links "`taskId` waits on each of `blockerIds`". */
export async function deleteBlockers(tx: Tx, taskId: string, blockerIds: string[]): Promise<void> {
  if (blockerIds.length === 0) return;
  await tx
    .delete(taskDependency)
    .where(and(eq(taskDependency.taskId, taskId), inArray(taskDependency.blockerId, blockerIds)));
}
