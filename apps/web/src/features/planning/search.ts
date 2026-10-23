import { MILESTONE_STATUSES, type MilestoneStatus, TASK_STATUSES, type TaskStatus } from '@pm/contracts';

// Search params of the milestone and cycle screens, so filters survive reloads and shared links.
//
//   /p/PAY/milestones?status=planned&sort=name
//   /p/PAY/milestones/<id>?status=todo,in_progress&assignee=me&cycle=current
//   /p/PAY/cycles/12?status=todo&assignee=agents&milestone=none

export const MILESTONE_SORTS = ['target', 'name', 'progress'] as const;
export type MilestoneSort = (typeof MILESTONE_SORTS)[number];

export interface MilestonesSearch {
  /** Statuses listed open; Completed always folds into its own group at the bottom. */
  status?: MilestoneStatus[];
  sort?: MilestoneSort;
}

export interface PlanningTasksSearch {
  status?: TaskStatus[];
  /** me, agents, none or a user id. */
  assignee?: string;
  /** Milestone page: a cycle number, current, next or none. */
  cycle?: string;
  /** Cycle page: a milestone id or none. */
  milestone?: string;
}

function list<T extends string>(value: unknown, allowed: readonly T[]): T[] | undefined {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  const picked = allowed.filter((item) => raw.includes(item));
  return picked.length ? picked : undefined;
}

function text(value: unknown): string | undefined {
  if (typeof value === 'number') return String(value);
  return typeof value === 'string' && value.trim() && value.length <= 100 ? value.trim() : undefined;
}

export function parseMilestonesSearch(search: Record<string, unknown>): MilestonesSearch {
  const sort = MILESTONE_SORTS.find((item) => item === search.sort);
  return {
    ...(list(search.status, MILESTONE_STATUSES) ? { status: list(search.status, MILESTONE_STATUSES) } : {}),
    ...(sort && sort !== 'target' ? { sort } : {}),
  };
}

export function parsePlanningTasksSearch(search: Record<string, unknown>): PlanningTasksSearch {
  const status = list(search.status, TASK_STATUSES);
  const assignee = text(search.assignee);
  const cycle = text(search.cycle);
  const milestone = text(search.milestone);
  return {
    ...(status ? { status } : {}),
    ...(assignee ? { assignee } : {}),
    ...(cycle ? { cycle } : {}),
    ...(milestone ? { milestone } : {}),
  };
}

/** Planned and Active when no status is picked. */
export const DEFAULT_MILESTONE_STATUSES: readonly MilestoneStatus[] = ['planned', 'active'];
