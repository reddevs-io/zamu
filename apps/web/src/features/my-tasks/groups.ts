import { PRIORITIES, type StatusCounts, type TaskListItem, type TaskStatus } from '@pm/contracts';
import { type DataGroup, OPEN_STATUSES, STATUS_LABELS } from '~/ui';

// My tasks grouped by status and sorted by priority, plus the header line.

const priorityRank = (item: TaskListItem) => PRIORITIES.indexOf(item.priority);

/** Highest priority first, then most recently updated, then key. */
export function compareMyTasks(a: TaskListItem, b: TaskListItem): number {
  return (
    priorityRank(b) - priorityRank(a) ||
    b.updatedAt.localeCompare(a.updatedAt) ||
    a.key.localeCompare(b.key, 'en', { numeric: true })
  );
}

/** One group per shown status that has tasks, in the given order. */
export function buildMyGroups(
  items: readonly TaskListItem[],
  statuses: readonly TaskStatus[],
): DataGroup<TaskListItem>[] {
  const byStatus = new Map<TaskStatus, TaskListItem[]>();
  for (const item of items) {
    const bucket = byStatus.get(item.status);
    if (bucket) bucket.push(item);
    else byStatus.set(item.status, [item]);
  }
  return statuses.flatMap((status) => {
    const rows = byStatus.get(status);
    if (!rows?.length) return [];
    rows.sort(compareMyTasks);
    return [{ id: status, label: STATUS_LABELS[status], status, count: rows.length, items: rows }];
  });
}

/** Keys of the rows J/K moves through, top to bottom, skipping collapsed groups. */
export function rowOrder(
  groups: readonly DataGroup<TaskListItem>[],
  collapsed: ReadonlySet<string>,
): string[] {
  return groups.flatMap((group) => (collapsed.has(group.id) ? [] : group.items.map((item) => item.key)));
}

const openCount = (counts: StatusCounts) => OPEN_STATUSES.reduce((sum, status) => sum + counts[status], 0);

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/**
 * "8 open across 4 projects in Reddevs". Counts ignore the Status filter (they come from the server);
 * the project count is only known when the rows are the open tasks, so other status filters leave it out.
 * With the panel open the workspace is left out to save room.
 */
export function myTasksSubtitle({
  counts,
  items,
  openOnly,
  workspace,
  compact = false,
}: {
  counts: StatusCounts | undefined;
  items: readonly TaskListItem[];
  /** The rows are exactly the open tasks (Status filter unset). */
  openOnly: boolean;
  workspace: string | undefined;
  compact?: boolean;
}): string {
  if (!counts) return workspace ?? '';
  const open = openCount(counts);
  if (open === 0) return workspace ?? '';
  const projects = new Set(items.map((item) => item.project.key)).size;
  const across = openOnly ? ` across ${plural(projects, 'project')}` : '';
  const where = !compact && workspace ? ` in ${workspace}` : '';
  return `${open} open${across}${where}`;
}
