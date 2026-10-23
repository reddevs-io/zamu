// Activity: one row per task change, written in the transaction of the change. M3 adds the
// origin (app or a Backlog.md refresh), the commit a refresh read, and project-level rows.
import {
  type Activity,
  type ActivityChange,
  ActivityList,
  type ActivityOrigin,
  formatTaskKey,
  ListTaskActivityInput,
  type Priority,
  ProjectActivity,
  ProjectActivityDetails,
  type ProjectActivityType,
  type TaskActivityType,
  type TaskStatus,
} from '@pm/contracts';
import { type DbOrTx, schema, type Tx } from '@pm/db';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import type { Actor } from './authz';
import type { DbContext } from './context';
import { parseInput } from './errors';
import { findTask, loadUsers, userRef } from './internal';

/**
 * A change as stored in activity.changes: priority by name; assignee, milestone and cycle by id.
 * listTaskActivity resolves the ids to references.
 *
 * M3: `backlog` lists the Backlog.md-only fields a refresh changed (BacklogBlock keys such as
 * labels or dependencies, and createdAt); reads return them as Activity.backlogFields. Write at
 * most one per row.
 */
export type StoredChange =
  | { field: 'title' | 'description'; from: string | null; to: string | null }
  | { field: 'status'; from: TaskStatus | null; to: TaskStatus | null }
  | { field: 'priority'; from: Priority | null; to: Priority | null }
  | { field: 'assignee' | 'milestone' | 'cycle'; from: string | null; to: string | null }
  | { field: 'backlog'; from: null; to: string[] };

/** Fields of StoredChange that map to an ActivityChange of the contract. */
const CONTRACT_FIELDS = new Set<string>([
  'title',
  'description',
  'status',
  'priority',
  'assignee',
  'milestone',
  'cycle',
]);

/** Where a row comes from. Defaults to the app; a Backlog.md refresh passes its commit. */
export interface ActivityOriginFields {
  /** Default app. backlog rows must be written with a null actor (the Backlog.md actor). */
  origin?: ActivityOrigin;
  /** The commit a Backlog.md refresh read. */
  originRef?: string | null;
}

export interface ActivityEntry extends ActivityOriginFields {
  projectId: string;
  taskId: string;
  type: TaskActivityType;
  changes: StoredChange[];
}

/** A system entry has no actor (the hourly cycle job, a Backlog.md refresh), so it names its workspace. */
export interface SystemActivityEntry extends ActivityEntry {
  workspaceId: string;
}

/** M3: a project-level entry (no task): project.backlog_imported, project.backlog_detached. */
export interface ProjectActivityEntry extends ActivityOriginFields {
  projectId: string;
  type: ProjectActivityType;
  details: z.input<typeof ProjectActivityDetails>;
}

export interface SystemProjectActivityEntry extends ProjectActivityEntry {
  workspaceId: string;
}

type AnyEntry = ActivityEntry | ProjectActivityEntry;
type AnySystemEntry = SystemActivityEntry | SystemProjectActivityEntry;

export type ActivityRow = typeof schema.activity.$inferSelect;

/** Project details are stored as one change per field, like task changes: { field, from: null, to }. */
const DETAIL_FIELDS = ['mode', 'repository', 'tasks', 'milestones'] as const;

function detailsToChanges(details: z.input<typeof ProjectActivityDetails>) {
  const parsed = ProjectActivityDetails.parse(details);
  return DETAIL_FIELDS.filter((field) => parsed[field] !== null).map((field) => ({
    field,
    from: null,
    to: parsed[field],
  }));
}

function changesToDetails(changes: ActivityRow['changes']): ProjectActivityDetails {
  const values: Record<string, unknown> = {};
  for (const change of changes) {
    if ((DETAIL_FIELDS as readonly string[]).includes(change.field)) values[change.field] = change.to;
  }
  const parsed = ProjectActivityDetails.safeParse(values);
  return parsed.success ? parsed.data : ProjectActivityDetails.parse({});
}

function activityValues(actor: Actor | null, entry: AnyEntry | AnySystemEntry) {
  const workspaceId = actor ? actor.workspaceId : (entry as AnySystemEntry).workspaceId;
  if (!workspaceId) throw new Error('A system activity entry needs its workspaceId');
  const origin = entry.origin ?? 'app';
  if (origin === 'backlog' && actor) {
    throw new Error('Backlog.md activity is written without an actor (the Backlog.md actor)');
  }
  const isProject = 'details' in entry;
  return {
    workspaceId,
    projectId: entry.projectId,
    taskId: isProject ? null : entry.taskId,
    actorId: actor?.userId ?? null,
    onBehalfOfId: actor?.onBehalfOfId ?? null,
    type: entry.type,
    changes: isProject ? detailsToChanges(entry.details) : entry.changes,
    origin,
    originRef: entry.originRef ?? null,
  };
}

/**
 * Writes an activity row as `actor` (and the responsible human for agents), or as the system
 * when `actor` is null (the hourly cycle job; a Backlog.md refresh with origin backlog). Call
 * inside the change's transaction.
 */
export async function recordActivity(tx: Tx, actor: Actor, entry: AnyEntry): Promise<void>;
export async function recordActivity(tx: Tx, actor: null, entry: AnySystemEntry): Promise<void>;
export async function recordActivity(
  tx: Tx,
  actor: Actor | null,
  entry: AnyEntry | AnySystemEntry,
): Promise<void> {
  await tx.insert(schema.activity).values(activityValues(actor, entry));
}

/** Writes several activity rows in one insert, e.g. one cycle.ended row per task moved. */
export async function recordActivities(tx: Tx, actor: Actor, entries: AnyEntry[]): Promise<void>;
export async function recordActivities(tx: Tx, actor: null, entries: AnySystemEntry[]): Promise<void>;
export async function recordActivities(
  tx: Tx,
  actor: Actor | null,
  entries: (AnyEntry | AnySystemEntry)[],
): Promise<void> {
  if (entries.length === 0) return;
  await tx.insert(schema.activity).values(entries.map((entry) => activityValues(actor, entry)));
}

/** Name shown for a milestone that was deleted after the change was recorded. */
export const DELETED_MILESTONE_NAME = 'Deleted milestone';

/** Actor and on-behalf-of references of activity rows, resolved in one query. */
async function loadActors(db: DbOrTx, rows: ActivityRow[], extraUserIds: Iterable<string> = []) {
  const userIds = new Set<string>(extraUserIds);
  for (const row of rows) {
    if (row.actorId) userIds.add(row.actorId);
    if (row.onBehalfOfId) userIds.add(row.onBehalfOfId);
  }
  const users = await loadUsers(db, userIds);
  const user = (id: string | null) => {
    const row = id ? users.get(id) : undefined;
    return row ? userRef(row) : null;
  };
  // A null actor_id is the system or Backlog.md; a missing user (should not happen: restrict) stays visible.
  const actor = (id: string | null) =>
    id ? (user(id) ?? { id, name: 'Unknown', kind: 'person' as const }) : null;
  return { user, actor };
}

/**
 * Maps activity rows of one task to the contract shape, resolving user, milestone and cycle ids
 * in three queries. Rows keep their order. Shared with the timeline.
 */
export async function toActivities(db: DbOrTx, taskKey: string, rows: ActivityRow[]): Promise<Activity[]> {
  const userIds = new Set<string>();
  const milestoneIds = new Set<string>();
  const cycleIds = new Set<string>();
  for (const row of rows) {
    for (const change of row.changes as StoredChange[]) {
      if (change.field !== 'assignee' && change.field !== 'milestone' && change.field !== 'cycle') continue;
      const ids =
        change.field === 'assignee' ? userIds : change.field === 'milestone' ? milestoneIds : cycleIds;
      if (change.from) ids.add(change.from);
      if (change.to) ids.add(change.to);
    }
  }

  const [{ user, actor }, milestones, cycles] = await Promise.all([
    loadActors(db, rows, userIds),
    milestoneIds.size === 0
      ? []
      : db
          .select({ id: schema.milestone.id, name: schema.milestone.name })
          .from(schema.milestone)
          .where(inArray(schema.milestone.id, [...milestoneIds])),
    cycleIds.size === 0
      ? []
      : db
          .select({ id: schema.cycle.id, number: schema.cycle.number, name: schema.cycle.name })
          .from(schema.cycle)
          .where(inArray(schema.cycle.id, [...cycleIds])),
  ]);
  const milestoneById = new Map(milestones.map((row) => [row.id, row]));
  const cycleById = new Map(cycles.map((row) => [row.id, row]));

  const milestone = (id: string | null) =>
    id ? (milestoneById.get(id) ?? { id, name: DELETED_MILESTONE_NAME }) : null;
  // Cycles are never deleted on their own (only with their project, which takes the task along).
  const cycle = (id: string | null) => (id ? (cycleById.get(id) ?? null) : null);

  const resolve = (change: StoredChange): z.input<typeof ActivityChange> => {
    switch (change.field) {
      case 'assignee':
        return { field: 'assignee', from: user(change.from), to: user(change.to) };
      case 'milestone':
        return { field: 'milestone', from: milestone(change.from), to: milestone(change.to) };
      case 'cycle':
        return { field: 'cycle', from: cycle(change.from), to: cycle(change.to) };
      default:
        return change as z.input<typeof ActivityChange>;
    }
  };

  return ActivityList.parse({
    items: rows.map((row): z.input<typeof Activity> => {
      const changes = row.changes as StoredChange[];
      return {
        id: row.id,
        type: row.type,
        taskKey,
        actor: actor(row.actorId),
        onBehalfOf: user(row.onBehalfOfId),
        changes: changes.filter((change) => CONTRACT_FIELDS.has(change.field)).map(resolve),
        origin: row.origin,
        originRef: row.originRef,
        backlogFields: changes.flatMap((change) =>
          change.field === 'backlog' && Array.isArray(change.to) ? change.to.map(String) : [],
        ),
        createdAt: row.createdAt,
      };
    }),
  }).items;
}

/** Maps project-level activity rows to the contract shape. Rows keep their order. */
export async function toProjectActivities(db: DbOrTx, rows: ActivityRow[]): Promise<ProjectActivity[]> {
  const { user, actor } = await loadActors(db, rows);
  return z.array(ProjectActivity).parse(
    rows.map(
      (row): z.input<typeof ProjectActivity> => ({
        id: row.id,
        type: row.type as ProjectActivityType,
        actor: actor(row.actorId),
        onBehalfOf: user(row.onBehalfOfId),
        origin: row.origin,
        originRef: row.originRef,
        details: changesToDetails(row.changes),
        createdAt: row.createdAt,
      }),
    ),
  );
}

/** The activity rows of a task, oldest first (ties by id). */
export async function loadTaskActivityRows(db: DbOrTx, taskId: string): Promise<ActivityRow[]> {
  return db
    .select()
    .from(schema.activity)
    .where(eq(schema.activity.taskId, taskId))
    .orderBy(asc(schema.activity.createdAt), asc(schema.activity.id));
}

/** The project-level rows of a project (no task), oldest first (ties by id). */
export async function loadProjectActivityRows(db: DbOrTx, projectId: string): Promise<ActivityRow[]> {
  return db
    .select()
    .from(schema.activity)
    .where(and(eq(schema.activity.projectId, projectId), isNull(schema.activity.taskId)))
    .orderBy(asc(schema.activity.createdAt), asc(schema.activity.id));
}

/** The activity of a task, oldest first, with user, milestone and cycle ids resolved to references. */
export async function listTaskActivity(
  { db }: DbContext,
  actor: Actor,
  input: z.input<typeof ListTaskActivityInput>,
): Promise<ActivityList> {
  const { key, project: narrow } = parseInput(ListTaskActivityInput, input);
  const { project, task } = await findTask(db, actor, key, { project: narrow });
  const rows = await loadTaskActivityRows(db, task.id);
  return { items: await toActivities(db, formatTaskKey(project.key, task.number, task.keySuffix), rows) };
}
