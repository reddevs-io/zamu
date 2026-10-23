import type { Dashboard } from '@pm/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouterState } from '@tanstack/react-router';
import { useEffect } from 'react';
import { dashboardCountsQuery, dashboardKey, dashboardQuery } from '~/features/dashboard/queries';
import { DASHBOARD_HREF } from './paths';

// The number under "Dashboard" in the rail: the Mine queue total. Every page reads it from
// GET /dashboard/counts; the dashboard in Mine uses its own answer instead, so the rail and the queue
// header can never disagree there.

/** Sum of the four group totals. */
export function queueTotal(dashboard: Pick<Dashboard, 'groups'>): number {
  const { review, mentions, stalled, deadlines } = dashboard.groups;
  return review.total + mentions.total + stalled.total + deadlines.total;
}

/** "8 items need you", "1 item needs you". */
export function railCountLabel(count: number): string {
  return count === 1 ? '1 item needs you' : `${count} items need you`;
}

export function useDashboardRailCount(): number | undefined {
  const onMine = useRouterState({
    select: (state) =>
      state.location.pathname === DASHBOARD_HREF &&
      (state.location.search as { scope?: unknown }).scope !== 'everyone',
  });
  // Reads what the page loaded; never fetches on its own.
  const page = useQuery({ ...dashboardQuery('mine'), enabled: false });
  const pageTotal = onMine && page.data && !page.isPlaceholderData ? queueTotal(page.data) : undefined;
  const counts = useQuery({ ...dashboardCountsQuery(), enabled: pageTotal === undefined });
  return pageTotal ?? counts.data?.total;
}

/**
 * Edits anywhere (status changes, comments, assignments) can add or clear queue items: refresh the
 * dashboard and the rail count after every successful mutation instead of waiting for the next tick.
 */
export function useRefreshDashboardAfterEdits(): void {
  const queryClient = useQueryClient();
  useEffect(
    () =>
      queryClient.getMutationCache().subscribe((event) => {
        if (event.type === 'updated' && event.action.type === 'success') {
          void queryClient.invalidateQueries({ queryKey: dashboardKey() });
        }
      }),
    [queryClient],
  );
}
