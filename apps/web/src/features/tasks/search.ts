import {
  ASSIGNEE_AGENTS,
  ASSIGNEE_ME,
  type ListTasksInput,
  PRIORITIES,
  type Priority,
  safeParseTaskKey,
  TASK_STATUSES,
  type TaskStatus,
} from '@pm/contracts';

// URL state of the task list: /p/PAY?task=PAY-142&q=webhook&status=todo,in_progress&priority=high&assignee=me
// Everything lives in the URL so a reload, a shared link or the back button restores the same view.

export interface TaskListSearch {
  /** Selected task key (the detail pane follows it). */
  task?: string;
  /** Search text: matches the title or the key. */
  q?: string;
  status?: TaskStatus[];
  priority?: Priority[];
  /** 'me', 'agents' or a user id. */
  assignee?: string;
}

/** Display order of the groups: active work first, then the collapsed ones. */
export const GROUP_ORDER: readonly TaskStatus[] = [
  'in_progress',
  'in_review',
  'todo',
  'backlog',
  'done',
  'canceled',
];

/** Fetched with the page. The other groups load when someone expands them. */
export const EAGER_STATUSES: readonly TaskStatus[] = ['in_progress', 'in_review', 'todo'];

/** Collapsed until expanded (when no status filter is set). */
export const LAZY_STATUSES: readonly TaskStatus[] = ['backlog', 'done', 'canceled'];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function listParam<T extends string>(value: unknown, allowed: readonly T[]): T[] | undefined {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  const picked = allowed.filter((item) => raw.includes(item));
  return picked.length ? picked : undefined;
}

/** validateSearch for the task list route. Drops anything it does not understand. */
export function parseTaskListSearch(search: Record<string, unknown>): TaskListSearch {
  const result: TaskListSearch = {};
  if (typeof search.task === 'string') {
    const key = search.task.trim().toUpperCase();
    if (safeParseTaskKey(key)) result.task = key;
  }
  if (typeof search.q === 'string' && search.q.trim()) result.q = search.q.slice(0, 200);
  const status = listParam(search.status, TASK_STATUSES);
  if (status) result.status = status;
  const priority = listParam(search.priority, PRIORITIES);
  if (priority) result.priority = priority;
  if (
    typeof search.assignee === 'string' &&
    (search.assignee === ASSIGNEE_ME || search.assignee === ASSIGNEE_AGENTS || UUID.test(search.assignee))
  ) {
    result.assignee = search.assignee;
  }
  return result;
}

export function hasFilters(search: TaskListSearch): boolean {
  return Boolean(search.q?.trim() || search.status || search.priority || search.assignee);
}

/** The filters only (no selection), so selecting a task never changes a query key. */
export type TaskListFilters = Omit<TaskListSearch, 'task'>;

export function filtersOf(search: TaskListSearch): TaskListFilters {
  const { task: _task, ...filters } = search;
  return filters;
}

/** tasks.list input for a set of statuses under the current filters. */
export function listInput(
  projectKey: string,
  filters: TaskListFilters,
  statuses: readonly TaskStatus[],
): Omit<ListTasksInput, 'limit' | 'cursor'> {
  return {
    project: projectKey,
    status: [...statuses],
    ...(filters.q?.trim() ? { q: filters.q.trim() } : {}),
    ...(filters.priority ? { priority: filters.priority } : {}),
    ...(filters.assignee ? { assignee: filters.assignee } : {}),
  };
}

/**
 * Which statuses load with the page. Without a status filter: in progress, in review and todo (backlog,
 * done and canceled wait until expanded). With one: exactly the filtered statuses, all expanded.
 */
export function eagerStatuses(filters: TaskListFilters): TaskStatus[] {
  if (filters.status) return GROUP_ORDER.filter((status) => filters.status?.includes(status));
  return [...EAGER_STATUSES];
}

/** Groups shown in the table, in display order. */
export function visibleStatuses(filters: TaskListFilters): TaskStatus[] {
  if (filters.status) return GROUP_ORDER.filter((status) => filters.status?.includes(status));
  return [...GROUP_ORDER];
}
