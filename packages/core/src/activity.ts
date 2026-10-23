// Activity: one row per task change, written in the transaction of the change.
import {
  type Activity,
  type ActivityChange,
  ActivityList,
  type ActivityType,
  formatTaskKey,
  ListTaskActivityInput,
  type Priority,
  type TaskStatus,
} from '@pm/contracts';
import { type DbOrTx, schema, type Tx } from '@pm/db';
import { asc, eq, inArray } from 'drizzle-orm';
import type { z } from 'zod';
import type { Actor } from './authz';
import type { DbContext } from './context';
import { parseInput } from './errors';
import { findTask, loadUsers, userRef } from './internal';

/**
 * A change as stored in activity.changes: priority by name; assignee, milestone and cycle by id.
 * listTaskActivity resolves the ids to references.
 */
export type StoredChange =
  | { field: 'title' | 'description'; from: string | null; to: string | null }
  | { field: 'status'; from: TaskStatus | null; to: TaskStatus | null }
  | { field: 'priority'; from: Priority | null; to: Priority | null }
  | { field: 'assignee' | 'milestone' | 'cycle'; from: string | null; to: string | null };

export interface ActivityEntry {
  projectId: string;
  taskId: string;
  type: ActivityType;
  changes: StoredChange[];
}

/** A system entry has no actor (the hourly job ending a cycle), so it names its workspace. */
export interface SystemActivityEntry extends ActivityEntry {
  workspaceId: string;
}

export type ActivityRow = typeof schema.activity.$inferSelect;

function activityValues(actor: Actor | null, entry: ActivityEntry | SystemActivityEntry) {
  const workspaceId = actor ? actor.workspaceId : (entry as SystemActivityEntry).workspaceId;
  if (!workspaceId) throw new Error('A system activity entry needs its workspaceId');
  return {
    workspaceId,
    projectId: entry.projectId,
    taskId: entry.taskId,
    actorId: actor?.userId ?? null,
    onBehalfOfId: actor?.onBehalfOfId ?? null,
    type: entry.type,
    changes: entry.changes,
  };
}

/**
 * Writes an activity row as `actor` (and the responsible human for agents), or as the system
 * when `actor` is null. Call inside the change's transaction.
 */
export async function recordActivity(tx: Tx, actor: Actor, entry: ActivityEntry): Promise<void>;
export async function recordActivity(tx: Tx, actor: null, entry: SystemActivityEntry): Promise<void>;
export async function recordActivity(
  tx: Tx,
  actor: Actor | null,
  entry: ActivityEntry | SystemActivityEntry,
): Promise<void> {
  await tx.insert(schema.activity).values(activityValues(actor, entry));
}

/** Writes several activity rows in one insert, e.g. one cycle.ended row per task moved. */
export async function recordActivities(tx: Tx, actor: Actor, entries: ActivityEntry[]): Promise<void>;
export async function recordActivities(tx: Tx, actor: null, entries: SystemActivityEntry[]): Promise<void>;
export async function recordActivities(
  tx: Tx,
  actor: Actor | null,
  entries: (ActivityEntry | SystemActivityEntry)[],
): Promise<void> {
  if (entries.length === 0) return;
  await tx.insert(schema.activity).values(entries.map((entry) => activityValues(actor, entry)));
}

/** Name shown for a milestone that was deleted after the change was recorded. */
export const DELETED_MILESTONE_NAME = 'Deleted milestone';

/**
 * Maps activity rows of one task to the contract shape, resolving user, milestone and cycle ids
 * in three queries. Rows keep their order. Shared with the timeline.
 */
export async function toActivities(db: DbOrTx, taskKey: string, rows: ActivityRow[]): Promise<Activity[]> {
  const userIds = new Set<string>();
  const milestoneIds = new Set<string>();
  const cycleIds = new Set<string>();
  for (const row of rows) {
    if (row.actorId) userIds.add(row.actorId);
    if (row.onBehalfOfId) userIds.add(row.onBehalfOfId);
    for (const change of row.changes as StoredChange[]) {
      const ids =
        change.field === 'assignee'
          ? userIds
          : change.field === 'milestone'
            ? milestoneIds
            : change.field === 'cycle'
              ? cycleIds
              : null;
      if (!ids) continue;
      if (change.from) ids.add(change.from);
      if (change.to) ids.add(change.to);
    }
  }

  const [users, milestones, cycles] = await Promise.all([
    loadUsers(db, userIds),
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

  const user = (id: string | null) => {
    const row = id ? users.get(id) : undefined;
    return row ? userRef(row) : null;
  };
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
        return change;
    }
  };

  return ActivityList.parse({
    items: rows.map(
      (row): z.input<typeof Activity> => ({
        id: row.id,
        type: row.type,
        taskKey,
        // A null actor_id is the system; a missing user (should not happen: restrict) stays visible.
        actor: row.actorId
          ? (user(row.actorId) ?? { id: row.actorId, name: 'Unknown', kind: 'person' })
          : null,
        onBehalfOf: user(row.onBehalfOfId),
        changes: (row.changes as StoredChange[]).map(resolve),
        createdAt: row.createdAt,
      }),
    ),
  }).items;
}

/** The activity rows of a task, oldest first (ties by id). */
export async function loadTaskActivityRows(db: DbOrTx, taskId: string): Promise<ActivityRow[]> {
  return db
    .select()
    .from(schema.activity)
    .where(eq(schema.activity.taskId, taskId))
    .orderBy(asc(schema.activity.createdAt), asc(schema.activity.id));
}

/** The activity of a task, oldest first, with user, milestone and cycle ids resolved to references. */
export async function listTaskActivity(
  { db }: DbContext,
  actor: Actor,
  input: z.input<typeof ListTaskActivityInput>,
): Promise<ActivityList> {
  const { key } = parseInput(ListTaskActivityInput, input);
  const { project, task } = await findTask(db, actor, key);
  const rows = await loadTaskActivityRows(db, task.id);
  return { items: await toActivities(db, formatTaskKey(project.key, task.number), rows) };
}
