import {
  ASSIGNEE_AGENTS,
  ASSIGNEE_ME,
  CYCLE_CURRENT,
  CYCLE_NEXT,
  FILTER_NONE,
  type ListTasksInput,
  PRIORITIES,
  type Priority,
  safeParseTaskKey,
  TASK_STATUSES,
  type TaskStatus,
} from '@pm/contracts';

// URL state of a project's tasks, list and board:
//   /p/PAY?task=PAY-142&q=webhook&status=todo,in_progress&priority=high&assignee=me
//          &milestone=<id>|none&cycle=12|current|next|none&view=board&lanes=assignee
// Everything lives in the URL so a reload, a shared link or the back button restores the same view.

/** Swimlanes of the board. */
export type BoardLanes = 'assignee' | 'milestone';
export const BOARD_LANES: readonly BoardLanes[] = ['assignee', 'milestone'];

/** List (the default, absent from the URL) or board. */
export type TaskView = 'list' | 'board';

/** Cycle filter: a cycle number, current, next, or none (tasks without a cycle). */
export type CycleFilterValue = number | typeof CYCLE_CURRENT | typeof CYCLE_NEXT | typeof FILTER_NONE;

export interface TaskListSearch {
  /** Selected task key (the detail pane follows it). */
  task?: string;
  /** Search text: matches the title or the key. */
  q?: string;
  status?: TaskStatus[];
  priority?: Priority[];
  /** 'me', 'agents' or a user id. */
  assignee?: string;
  /** A milestone id, or 'none'. */
  milestone?: string;
  cycle?: CycleFilterValue;
  /** 'board' shows the board; absent means the list. */
  view?: 'board';
  /** Board only: swimlanes by assignee or by milestone. */
  lanes?: BoardLanes;
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
const CYCLE_NUMBER = /^[1-9][0-9]{0,8}$/;

function listParam<T extends string>(value: unknown, allowed: readonly T[]): T[] | undefined {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  const picked = allowed.filter((item) => raw.includes(item));
  return picked.length ? picked : undefined;
}

function cycleParam(value: unknown): CycleFilterValue | undefined {
  if (value === CYCLE_CURRENT || value === CYCLE_NEXT || value === FILTER_NONE) return value;
  if (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value < 1e9) return value;
  if (typeof value === 'string' && CYCLE_NUMBER.test(value)) return Number(value);
  return undefined;
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
  if (
    typeof search.milestone === 'string' &&
    (search.milestone === FILTER_NONE || UUID.test(search.milestone))
  ) {
    result.milestone = search.milestone.toLowerCase();
  }
  const cycle = cycleParam(search.cycle);
  if (cycle !== undefined) result.cycle = cycle;
  if (search.view === 'board') result.view = 'board';
  if (typeof search.lanes === 'string' && (BOARD_LANES as readonly string[]).includes(search.lanes)) {
    result.lanes = search.lanes as BoardLanes;
  }
  return result;
}

export function hasFilters(search: TaskListSearch): boolean {
  return Boolean(
    search.q?.trim() ||
      search.status ||
      search.priority ||
      search.assignee ||
      search.milestone ||
      search.cycle !== undefined,
  );
}

/** The filters only (no selection, view or lanes), so selecting a task never changes a query key. */
export type TaskListFilters = Omit<TaskListSearch, 'task' | 'view' | 'lanes'>;

export function filtersOf(search: TaskListSearch): TaskListFilters {
  const { task: _task, view: _view, lanes: _lanes, ...filters } = search;
  return filters;
}

/** Drops the milestone and cycle filters when the project has the feature turned off. */
export function applyProjectFeatures(
  filters: TaskListFilters,
  project: { usesMilestones: boolean; usesCycles: boolean } | undefined,
): TaskListFilters {
  if (!project) return filters;
  const { milestone, cycle, ...rest } = filters;
  return {
    ...rest,
    ...(project.usesMilestones && milestone ? { milestone } : {}),
    ...(project.usesCycles && cycle !== undefined ? { cycle } : {}),
  };
}

/** The filter part of a tasks.list input (everything but project, order and status). */
function filterInput(filters: TaskListFilters) {
  return {
    ...(filters.q?.trim() ? { q: filters.q.trim() } : {}),
    ...(filters.priority ? { priority: filters.priority } : {}),
    ...(filters.assignee ? { assignee: filters.assignee } : {}),
    ...(filters.milestone ? { milestone: filters.milestone } : {}),
    ...(filters.cycle !== undefined ? { cycle: filters.cycle } : {}),
  };
}

/** tasks.list input for a set of statuses under the current filters. */
export function listInput(
  projectKey: string,
  filters: TaskListFilters,
  statuses: readonly TaskStatus[],
): Omit<ListTasksInput, 'limit' | 'cursor'> {
  return {
    project: [projectKey],
    order: 'list',
    status: [...statuses],
    ...filterInput(filters),
  };
}

/** tasks.list input of one board column: board order (rank), one status, the current filters. */
export function boardInput(
  projectKey: string,
  filters: TaskListFilters,
  status: TaskStatus,
): Omit<ListTasksInput, 'limit' | 'cursor'> & { project: string[]; status: TaskStatus[] } {
  return {
    project: [projectKey],
    order: 'board',
    status: [status],
    ...filterInput(filters),
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

/** Board columns, in status order (backlog first). A status filter keeps only the chosen ones. */
export function boardStatuses(filters: TaskListFilters): TaskStatus[] {
  if (filters.status) return TASK_STATUSES.filter((status) => filters.status?.includes(status));
  return [...TASK_STATUSES];
}

/** Columns folded on a fresh board: Done and Canceled. */
export const BOARD_FOLDED: readonly TaskStatus[] = ['done', 'canceled'];
