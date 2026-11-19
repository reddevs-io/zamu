import { PRIORITIES, type StatusCounts, type TaskListItem, type TaskStatus } from '@zamu/contracts';
import {
  type GroupBy,
  type GroupContext,
  groupTasks,
  type TaskGroupValue,
} from '~/features/views/display-options';
import { type DataGroup, STATUS_LABELS } from '~/ui';

// Groups of the task list. buildGroups and buildHiddenGroup are the M1–M4 status groups (DataTable
// shape, still used by tests and older callers); the M5 list uses buildListGroups and flattenListRows
// below.

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

// ---------------------------------------------------------------------------
// M5 list (frames 011–015): groups by any display field, nested subtasks, flat rows for the list
// ---------------------------------------------------------------------------

/** A top-level row of a group and, when subtasks are nested, its subtasks in key order. */
export interface ListEntry {
  task: TaskListItem;
  children: TaskListItem[];
}

export interface ListGroup {
  /** Stable within the grouping: a status, a priority, an id, 'none' or 'all'. */
  key: string;
  label: string;
  value: TaskGroupValue;
  /** The header's count: top-level rows once loaded, the server's count before. */
  count: number;
  entries: ListEntry[];
  /** Folded lazy status group whose rows have not loaded yet (Backlog, Done, Canceled). */
  pending: boolean;
}

export interface BuildListGroupsInput {
  /** Rows of every loaded query; merged by key, the first list wins. Already filtered for old done tasks. */
  lists: readonly (readonly TaskListItem[])[];
  groupBy: GroupBy;
  /** Subtasks under their parent (tree lines) when the parent is loaded too. */
  nested: boolean;
  context?: GroupContext;
  /**
   * Status grouping: statuses whose rows did not load (folded lazy groups), with the server's count.
   * They show as folded groups with that count.
   */
  pendingCounts?: Partial<Record<TaskStatus, number>>;
}

const keyOrder = (a: TaskListItem, b: TaskListItem) =>
  a.key.localeCompare(b.key, undefined, { numeric: true });

/** Groups the list shows, in order, with nested subtasks. */
export function buildListGroups({
  lists,
  groupBy,
  nested,
  context = {},
  pendingCounts = {},
}: BuildListGroupsInput): ListGroup[] {
  const seen = new Set<string>();
  const items: TaskListItem[] = [];
  for (const list of lists) {
    for (const item of list) {
      if (seen.has(item.key)) continue;
      seen.add(item.key);
      items.push(item);
    }
  }
  const children = new Map<string, TaskListItem[]>();
  let top = items;
  if (nested) {
    top = [];
    const byKey = new Map(items.map((item) => [item.key, item]));
    // The top-level ancestor of a task. Backlog.md files can nest subtasks more than one level
    // (API-12.1.2); the list draws one level, so deeper ones sit under the top ancestor. A loop in
    // the files leaves the task at the top.
    const ancestorOf = (item: TaskListItem): string | null => {
      const visited = new Set([item.key]);
      let parent = item.parentKey && byKey.get(item.parentKey);
      while (parent) {
        if (visited.has(parent.key)) return null;
        visited.add(parent.key);
        const next = parent.parentKey && byKey.get(parent.parentKey);
        if (!next) return parent.key;
        parent = next;
      }
      return null;
    };
    for (const item of items) {
      const parent = ancestorOf(item);
      if (parent) {
        const list = children.get(parent);
        if (list) list.push(item);
        else children.set(parent, [item]);
      } else {
        top.push(item);
      }
    }
    for (const list of children.values()) list.sort(keyOrder);
  }
  const statusGrouping = groupBy === 'status';
  const groups = groupTasks(top, groupBy, {
    ...context,
    // Status groups are all built, then kept when they have rows, a pending count or showEmptyGroups.
    showEmptyGroups: statusGrouping ? true : context.showEmptyGroups,
  });
  const result: ListGroup[] = [];
  for (const group of groups) {
    const status = group.value.field === 'status' ? group.value.status : undefined;
    const pendingCount = status ? pendingCounts[status] : undefined;
    const pending = pendingCount !== undefined && group.tasks.length === 0;
    const entries = group.tasks.map((task) => ({ task, children: children.get(task.key) ?? [] }));
    const count = pending ? (pendingCount ?? 0) : entries.length;
    if (statusGrouping && !context.showEmptyGroups && count === 0) continue;
    result.push({ key: group.key, label: group.label, value: group.value, count, entries, pending });
  }
  return result;
}

/** The one group of the hidden-tasks list (?hidden=only), most recently removed first. */
export function hiddenListGroup(items: readonly TaskListItem[]): ListGroup[] {
  const [group] = buildHiddenGroup(items);
  if (!group) return [];
  return [
    {
      key: HIDDEN_GROUP_ID,
      label: HIDDEN_GROUP_LABEL,
      value: { field: 'none' },
      count: group.items.length,
      entries: group.items.map((task) => ({ task, children: [] })),
      pending: false,
    },
  ];
}

export interface ListGroupRow {
  type: 'group';
  /** Row id: GROUP_ROW_PREFIX + the group key. */
  id: string;
  group: ListGroup;
  collapsed: boolean;
}

export interface ListTaskRow {
  type: 'task';
  /** Row id: group key + U+001F + task key (a task with several labels shows in several groups). */
  id: string;
  task: TaskListItem;
  groupKey: string;
  /** Row id of the group row; null in an ungrouped list. */
  groupRowId: string | null;
  /** 0: a top-level row; 1: a subtask nested under its parent. */
  depth: 0 | 1;
  /** The last subtask of its parent (the tree line stops halfway). */
  lastChild: boolean;
}

export type ListRow = ListGroupRow | ListTaskRow;

export const GROUP_ROW_PREFIX = '\u001fgroup:';
const SEPARATOR = '\u001f';

export const groupRowId = (groupKey: string) => GROUP_ROW_PREFIX + groupKey;
export const taskRowId = (groupKey: string, taskKey: string) => groupKey + SEPARATOR + taskKey;

/**
 * The rows the list draws, top to bottom. With `headers` false (grouping "None") there are no group
 * rows and nothing folds.
 */
export function flattenListRows(
  groups: readonly ListGroup[],
  collapsed: ReadonlySet<string>,
  headers = true,
): ListRow[] {
  const rows: ListRow[] = [];
  for (const group of groups) {
    const isCollapsed = headers && (collapsed.has(group.key) || group.pending);
    const headerId = headers ? groupRowId(group.key) : null;
    if (headerId) rows.push({ type: 'group', id: headerId, group, collapsed: isCollapsed });
    if (isCollapsed) continue;
    for (const entry of group.entries) {
      rows.push({
        type: 'task',
        id: taskRowId(group.key, entry.task.key),
        task: entry.task,
        groupKey: group.key,
        groupRowId: headerId,
        depth: 0,
        lastChild: false,
      });
      entry.children.forEach((child, index) => {
        rows.push({
          type: 'task',
          id: taskRowId(group.key, child.key),
          task: child,
          groupKey: group.key,
          groupRowId: headerId,
          depth: 1,
          lastChild: index === entry.children.length - 1,
        });
      });
    }
  }
  return rows;
}

/** Task keys in row order, each once (the selection's and the task view's order). */
export function orderedTaskKeys(rows: readonly ListRow[]): string[] {
  const seen = new Set<string>();
  const keys: string[] = [];
  for (const row of rows) {
    if (row.type !== 'task' || seen.has(row.task.key)) continue;
    seen.add(row.task.key);
    keys.push(row.task.key);
  }
  return keys;
}
