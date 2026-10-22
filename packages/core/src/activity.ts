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
import { schema, type Tx } from '@pm/db';
import { asc, eq } from 'drizzle-orm';
import type { z } from 'zod';
import type { Actor } from './authz';
import type { DbContext } from './context';
import { parseInput } from './errors';
import { findTask, loadUsers, userRef } from './internal';

/** A change as stored in activity.changes: priority by name, assignee by user id. */
export type StoredChange =
  | { field: 'title' | 'description'; from: string | null; to: string | null }
  | { field: 'status'; from: TaskStatus | null; to: TaskStatus | null }
  | { field: 'priority'; from: Priority | null; to: Priority | null }
  | { field: 'assignee'; from: string | null; to: string | null };

/** Writes an activity row as `actor` (and the responsible human for agents). Call inside the change's transaction. */
export async function recordActivity(
  tx: Tx,
  actor: Actor,
  entry: { projectId: string; taskId: string; type: ActivityType; changes: StoredChange[] },
): Promise<void> {
  await tx.insert(schema.activity).values({
    workspaceId: actor.workspaceId,
    projectId: entry.projectId,
    taskId: entry.taskId,
    actorId: actor.userId,
    onBehalfOfId: actor.onBehalfOfId,
    type: entry.type,
    changes: entry.changes,
  });
}

/** The activity of a task, oldest first, with user ids resolved to references. */
export async function listTaskActivity(
  { db }: DbContext,
  actor: Actor,
  input: z.input<typeof ListTaskActivityInput>,
): Promise<ActivityList> {
  const { key } = parseInput(ListTaskActivityInput, input);
  const { project, task } = await findTask(db, actor, key);
  const rows = await db
    .select()
    .from(schema.activity)
    .where(eq(schema.activity.taskId, task.id))
    .orderBy(asc(schema.activity.createdAt), asc(schema.activity.id));

  const ids = new Set<string>();
  for (const row of rows) {
    ids.add(row.actorId);
    if (row.onBehalfOfId) ids.add(row.onBehalfOfId);
    for (const change of row.changes as StoredChange[]) {
      if (change.field !== 'assignee') continue;
      if (change.from) ids.add(change.from);
      if (change.to) ids.add(change.to);
    }
  }
  const users = await loadUsers(db, ids);
  const ref = (id: string | null) => {
    const row = id ? users.get(id) : undefined;
    return row ? userRef(row) : null;
  };

  const taskKey = formatTaskKey(project.key, task.number);
  return ActivityList.parse({
    items: rows.map(
      (row): z.input<typeof Activity> => ({
        id: row.id,
        type: row.type,
        taskKey,
        actor: ref(row.actorId) ?? { id: row.actorId, name: 'Unknown', kind: 'person' },
        onBehalfOf: ref(row.onBehalfOfId),
        changes: (row.changes as StoredChange[]).map(
          (change): ActivityChange =>
            change.field === 'assignee'
              ? { field: 'assignee', from: ref(change.from), to: ref(change.to) }
              : change,
        ),
        createdAt: row.createdAt,
      }),
    ),
  });
}
