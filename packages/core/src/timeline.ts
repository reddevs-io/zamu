// The task timeline: activity entries and comments in one list, oldest first.
import { formatTaskKey, ListTaskTimelineInput, type Timeline, type TimelineItem } from '@zamu/contracts';
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
 * M3: the task may be addressed by its Backlog.md id. Entries a Backlog.md refresh wrote carry
 * origin backlog, the commit in originRef and a null actor (the Backlog.md actor); a null actor
 * with origin app is the system (the hourly cycle job). Hidden tasks keep their timeline.
 */
export async function listTaskTimeline(
  { db }: DbContext,
  actor: Actor,
  input: z.input<typeof ListTaskTimelineInput>,
): Promise<Timeline> {
  const { key, project: projectKey } = parseInput(ListTaskTimelineInput, input);
  const { project, task } = await findTask(db, actor, key, { project: projectKey });
  const taskKey = formatTaskKey(project.key, task.number, task.keySuffix);
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
