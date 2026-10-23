import { type DashboardScope, safeParseTaskKey } from '@pm/contracts';

// URL state of the dashboard: /dashboard?scope=everyone&open=review&task=PAY-140
// Mine is the default and leaves no parameter, so the plain URL is the everyday view.

export const QUEUE_GROUPS = ['review', 'mentions', 'stalled', 'deadlines'] as const;
export type QueueGroupId = (typeof QUEUE_GROUPS)[number];

export interface DashboardSearch {
  /** Unset means Mine. */
  scope?: 'everyone';
  /** The group expanded with Show all (A). One at a time. */
  open?: QueueGroupId;
  /** Task open in the side panel. */
  task?: string;
}

/** validateSearch for /dashboard. Drops anything it does not understand. */
export function parseDashboardSearch(search: Record<string, unknown>): DashboardSearch {
  const result: DashboardSearch = {};
  if (search.scope === 'everyone') result.scope = 'everyone';
  if (typeof search.open === 'string' && (QUEUE_GROUPS as readonly string[]).includes(search.open)) {
    result.open = search.open as QueueGroupId;
  }
  if (typeof search.task === 'string') {
    const key = search.task.trim().toUpperCase();
    if (safeParseTaskKey(key)) result.task = key;
  }
  return result;
}

export function scopeOf(search: DashboardSearch): DashboardScope {
  return search.scope === 'everyone' ? 'everyone' : 'mine';
}
