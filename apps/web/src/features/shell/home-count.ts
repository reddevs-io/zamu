import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { retryOnce } from '~/features/tasks/errors';
import { orpc } from '~/lib/orpc';

// The count after Home in the sidebar: what needs the viewer (review, mentions, blocked, overdue), from
// GET /home/counts on every page.

export function homeCountsQuery() {
  return orpc.home.counts.queryOptions({ retry: retryOnce });
}

/** "8 items need you", "1 item needs you". */
export function homeCountLabel(count: number): string {
  return count === 1 ? '1 item needs you' : `${count} items need you`;
}

/** The sidebar count; undefined until it loads or when it fails. */
export function useHomeCount(): number | undefined {
  return useQuery(homeCountsQuery()).data?.total;
}

/**
 * Edits anywhere (status changes, comments, assignments) can add or clear items: refresh the count and
 * Home after every successful mutation instead of waiting for the next tick.
 */
export function useRefreshCountsAfterEdits(): void {
  const queryClient = useQueryClient();
  useEffect(
    () =>
      queryClient.getMutationCache().subscribe((event) => {
        if (event.type === 'updated' && event.action.type === 'success') {
          void queryClient.invalidateQueries({ queryKey: orpc.home.key() });
        }
      }),
    [queryClient],
  );
}
