import {
  ASSIGNEE_ME,
  CYCLE_CURRENT,
  CYCLE_NEXT,
  FILTER_NONE,
  type ListTasksInput,
  PRIORITIES,
  PROJECT_KEY_PATTERN,
  type Priority,
  safeParseTaskKey,
  TASK_STATUSES,
  type TaskStatus,
} from '@pm/contracts';
import type { z } from 'zod';
import { OPEN_STATUSES } from '~/ui';

// URL state of My tasks: /my-tasks?task=WEB-88&q=pricing&project=PAY,WEB&status=todo&priority=high
//   &milestone=<id>|none&cycle=current|next|none
// Everything lives in the URL so a reload, a shared link or the back button restores the same view.

export const CYCLE_FILTERS = [CYCLE_CURRENT, CYCLE_NEXT, FILTER_NONE] as const;
export type MyCycleFilter = (typeof CYCLE_FILTERS)[number];

export interface MyTasksSearch {
  /** Selected task key: the task panel follows it. */
  task?: string;
  /** Search text: matches the title or the key. */
  q?: string;
  project?: string[];
  /** Unset means Open: every status but Done and Canceled. */
  status?: TaskStatus[];
  priority?: Priority[];
  /** A milestone id, or none. */
  milestone?: string;
  /** current and next resolve per project. */
  cycle?: MyCycleFilter;
}

/** The default Status filter ("Open"), in display order. */
export const OPEN_GROUPS: readonly TaskStatus[] = OPEN_STATUSES;

/** Display order of the groups. */
export const GROUP_ORDER: readonly TaskStatus[] = [...OPEN_GROUPS, 'done', 'canceled'];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function listParam(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  return typeof value === 'string' ? value.split(',') : [];
}

function pick<T extends string>(value: unknown, allowed: readonly T[]): T[] | undefined {
  const raw = listParam(value);
  const picked = allowed.filter((item) => raw.includes(item));
  return picked.length ? picked : undefined;
}

/** validateSearch for /my-tasks. Drops anything it does not understand. */
export function parseMyTasksSearch(search: Record<string, unknown>): MyTasksSearch {
  const result: MyTasksSearch = {};
  if (typeof search.task === 'string') {
    const key = search.task.trim().toUpperCase();
    if (safeParseTaskKey(key)) result.task = key;
  }
  if (typeof search.q === 'string' && search.q.trim()) result.q = search.q.slice(0, 200);
  const projects = [
    ...new Set(
      listParam(search.project)
        .map((key) => key.trim().toUpperCase())
        .filter((key) => PROJECT_KEY_PATTERN.test(key)),
    ),
  ];
  if (projects.length) result.project = projects;
  const status = pick(search.status, TASK_STATUSES);
  if (status) result.status = GROUP_ORDER.filter((item) => status.includes(item));
  const priority = pick(search.priority, PRIORITIES);
  if (priority) result.priority = priority;
  if (
    typeof search.milestone === 'string' &&
    (search.milestone === FILTER_NONE || UUID.test(search.milestone))
  ) {
    result.milestone = search.milestone.toLowerCase();
  }
  if (typeof search.cycle === 'string' && (CYCLE_FILTERS as readonly string[]).includes(search.cycle)) {
    result.cycle = search.cycle as MyCycleFilter;
  }
  return result;
}

/** The filters only (no selection), so selecting a task never changes a query key. */
export type MyTasksFilters = Omit<MyTasksSearch, 'task'>;

export function filtersOf(search: MyTasksSearch): MyTasksFilters {
  const { task: _task, ...filters } = search;
  return filters;
}

/** True when anything narrows the default view (Open tasks in every project). */
export function hasFilters(search: MyTasksSearch): boolean {
  return Boolean(
    search.q?.trim() ||
      search.project ||
      search.status ||
      search.priority ||
      search.milestone ||
      search.cycle,
  );
}

/** Statuses shown, in group order: the Status filter, or Open. */
export function shownStatuses(filters: MyTasksFilters): TaskStatus[] {
  return filters.status ? GROUP_ORDER.filter((status) => filters.status?.includes(status)) : [...OPEN_GROUPS];
}

type ListInput = Omit<z.input<typeof ListTasksInput>, 'limit' | 'cursor'>;

/** tasks.list input: the caller's tasks across every readable project (or the chosen ones). */
export function listInput(filters: MyTasksFilters): ListInput {
  return {
    assignee: ASSIGNEE_ME,
    order: 'list',
    status: shownStatuses(filters),
    ...(filters.project ? { project: filters.project } : {}),
    ...(filters.q?.trim() ? { q: filters.q.trim() } : {}),
    ...(filters.priority ? { priority: filters.priority } : {}),
    ...(filters.milestone ? { milestone: filters.milestone } : {}),
    ...(filters.cycle ? { cycle: filters.cycle } : {}),
  };
}
