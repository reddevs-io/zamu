import { PRIORITIES, type StatusCounts, type TaskListItem, type TaskStatus } from '@pm/contracts';
import { type DataGroup, STATUS_LABELS } from '~/ui';

// Groups the loaded tasks by status, in the list's display order, with the server's counts.

const priorityRank = (item: TaskListItem) => PRIORITIES.indexOf(item.priority);

/** Same order as the API: priority (highest first), then most recently updated. */
export function compareTasks(a: TaskListItem, b: TaskListItem): number {
  return priorityRank(b) - priorityRank(a) || b.updatedAt.localeCompare(a.updatedAt) || b.number - a.number;
}

/**
 * Builds the table's groups. Rows from several lists (the eager one and each expanded group) are merged
 * by key; the first list wins. Groups with neither rows nor a count are left out.
 */
export function buildGroups(
  lists: readonly (readonly TaskListItem[])[],
  statuses: readonly TaskStatus[],
  counts: StatusCounts | undefined,
): DataGroup<TaskListItem>[] {
  const seen = new Set<string>();
  const byStatus = new Map<TaskStatus, TaskListItem[]>();
  for (const list of lists) {
    for (const item of list) {
      if (seen.has(item.key)) continue;
      seen.add(item.key);
      const bucket = byStatus.get(item.status);
      if (bucket) bucket.push(item);
      else byStatus.set(item.status, [item]);
    }
  }
  const groups: DataGroup<TaskListItem>[] = [];
  for (const status of statuses) {
    const items = (byStatus.get(status) ?? []).sort(compareTasks);
    const count = Math.max(counts?.[status] ?? 0, items.length);
    if (!count) continue;
    groups.push({ id: status, label: STATUS_LABELS[status], status, count, items });
  }
  return groups;
}

/** Keys of the rows a person can move through, top to bottom, skipping collapsed groups. */
export function visibleKeys(
  groups: readonly DataGroup<TaskListItem>[],
  collapsed: ReadonlySet<string>,
): string[] {
  return groups.flatMap((group) => (collapsed.has(group.id) ? [] : group.items.map((item) => item.key)));
}

/** Id and label of the one group the hidden-tasks list shows. */
export const HIDDEN_GROUP_ID = 'hidden';
export const HIDDEN_GROUP_LABEL = 'Removed from Backlog.md';

/** Hidden tasks (their Backlog.md file is gone) as one group, most recently removed first. */
export function buildHiddenGroup(items: readonly TaskListItem[]): DataGroup<TaskListItem>[] {
  if (!items.length) return [];
  const sorted = [...items].sort(
    (a, b) => (b.hiddenAt ?? '').localeCompare(a.hiddenAt ?? '') || compareTasks(a, b),
  );
  return [{ id: HIDDEN_GROUP_ID, label: HIDDEN_GROUP_LABEL, count: sorted.length, items: sorted }];
}
