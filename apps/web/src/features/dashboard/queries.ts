import type { DashboardScope } from '@pm/contracts';
import { keepPreviousData, type QueryClient, queryOptions } from '@tanstack/react-query';
import { retryOnce, withTimeout } from '~/features/tasks/errors';
import { membersQuery, meQuery, REQUEST_TIMEOUT_MS } from '~/features/tasks/queries';
import { client, orpc } from '~/lib/orpc';

// Dashboard data. Both queries use the app-wide cadence (router.tsx): refetch on window focus and every
// 30 seconds. While a refetch or a scope switch loads, the last answer stays on screen.

export function dashboardQuery(scope: DashboardScope) {
  return queryOptions({
    queryKey: orpc.dashboard.get.queryKey({ input: { scope } }),
    queryFn: ({ signal }) =>
      client.dashboard.get({ scope }, { signal: withTimeout(signal, REQUEST_TIMEOUT_MS) }),
    retry: retryOnce,
    placeholderData: keepPreviousData,
  });
}

/** The Mine totals for the rail, on every page. */
export function dashboardCountsQuery() {
  return orpc.dashboard.counts.queryOptions({ retry: retryOnce });
}

/** Every dashboard query (page and rail count), for invalidation after edits. */
export function dashboardKey() {
  return orpc.dashboard.key();
}

/** Requests the dashboard route loader starts. */
export function prefetchDashboard(queryClient: QueryClient, scope: DashboardScope) {
  return Promise.all([
    queryClient.prefetchQuery(dashboardQuery(scope)),
    queryClient.prefetchQuery(meQuery()),
    queryClient.prefetchQuery(membersQuery()),
  ]);
}
