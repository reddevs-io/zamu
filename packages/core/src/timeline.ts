// The task timeline: activity entries and comments in one list, oldest first.
import { formatTaskKey, ListTaskTimelineInput, type Timeline, type TimelineItem } from '@pm/contracts';
import type { z } from 'zod';
import { loadTaskActivityRows, toActivities } from './activity';
import type { Actor } from './authz';
import { loadTaskCommentRows, toComments } from './comments';
import type { DbContext } from './context';
import { parseInput } from './errors';
import { findTask } from './internal';

function compareItems(a: TimelineItem, b: TimelineItem): number {
  const byTime = Date.parse(a.createdAt) - Date.parse(b.createdAt);
  if (byTime !== 0) return byTime;
  // uuidv7 ids sort by creation time, so they break ties within a millisecond (and inside one
  // transaction, where every row shares now()).
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * A task's history: activity entries and comments, oldest first, ties broken by id. Deleted
 * comments stay with a null body; their author is who deleted them (only authors delete).
 */
export async function listTaskTimeline(
  { db }: DbContext,
  actor: Actor,
  input: z.input<typeof ListTaskTimelineInput>,
): Promise<Timeline> {
  const { key } = parseInput(ListTaskTimelineInput, input);
  const { project, task } = await findTask(db, actor, key);
  const taskKey = formatTaskKey(project.key, task.number);
  const [activityRows, commentRows] = await Promise.all([
    loadTaskActivityRows(db, task.id),
    loadTaskCommentRows(db, task.id),
  ]);
  const [activities, comments] = await Promise.all([
    toActivities(db, taskKey, activityRows),
    toComments(db, taskKey, commentRows),
  ]);
  const items: TimelineItem[] = [
    ...activities.map((item) => ({ ...item, kind: 'activity' as const })),
    ...comments.map((item) => ({ ...item, kind: 'comment' as const })),
  ];
  return { items: items.sort(compareItems) };
}
