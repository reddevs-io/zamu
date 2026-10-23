import type { StatusCounts, TaskListItem, TaskStatus } from '@pm/contracts';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { boardInput, type TaskListFilters } from '~/features/tasks/search';
import { cardsOf } from './board-cache';
import { boardColumnQuery } from './queries';

// Data of the board: one infinite query per open column. Folded columns do not load; their count comes
// from the counts every page carries (they cover all statuses under the filters).

export interface ColumnState {
  status: TaskStatus;
  cards: TaskListItem[];
  /** Loaded and counted: the column has more pages. */
  hasMore: boolean;
  isLoading: boolean;
  isFetchingMore: boolean;
  error: unknown;
  fetchMore: () => Promise<unknown>;
  refetch: () => Promise<unknown>;
}

export interface BoardData {
  columns: Partial<Record<TaskStatus, ColumnState>>;
  /** Counts under the current filters, once any column answered. */
  counts: StatusCounts | undefined;
  /** True while no open column has data yet. */
  isLoading: boolean;
  /** The first column error without data. */
  error: unknown;
  refetch: () => void;
}

type ColumnQuery = ReturnType<typeof useColumn>;

function useColumn(projectKey: string, filters: TaskListFilters, status: TaskStatus, enabled: boolean) {
  return useInfiniteQuery({ ...boardColumnQuery(boardInput(projectKey, filters, status)), enabled });
}

/**
 * Loads the open columns. `loadAll` keeps fetching pages until every card is loaded (swimlanes need
 * every card to group them).
 */
export function useBoardData(
  projectKey: string,
  filters: TaskListFilters,
  open: ReadonlySet<TaskStatus>,
  loadAll: boolean,
): BoardData {
  // A fixed number of hooks, one per status, so the hook order never changes.
  const backlog = useColumn(projectKey, filters, 'backlog', open.has('backlog'));
  // With every column folded, todo still loads: its pages carry the counts of all columns.
  const todo = useColumn(projectKey, filters, 'todo', open.has('todo') || open.size === 0);
  const inProgress = useColumn(projectKey, filters, 'in_progress', open.has('in_progress'));
  const inReview = useColumn(projectKey, filters, 'in_review', open.has('in_review'));
  const done = useColumn(projectKey, filters, 'done', open.has('done'));
  const canceled = useColumn(projectKey, filters, 'canceled', open.has('canceled'));

  const queries: [TaskStatus, ColumnQuery][] = [
    ['backlog', backlog],
    ['todo', todo],
    ['in_progress', inProgress],
    ['in_review', inReview],
    ['done', done],
    ['canceled', canceled],
  ];

  useEffect(() => {
    if (!loadAll) return;
    for (const [status, query] of queries) {
      if (open.has(status) && query.hasNextPage && !query.isFetchingNextPage && !query.isError) {
        void query.fetchNextPage();
      }
    }
  });

  const dataKey = queries.map(([, query]) => query.dataUpdatedAt).join(',');
  const stateKey = queries
    .map(([, query]) => `${query.isPending}${query.isFetchingNextPage}${query.hasNextPage}${query.isError}`)
    .join(',');
  // biome-ignore lint/correctness/useExhaustiveDependencies: dataKey and stateKey stand for the queries
  return useMemo(() => {
    const columns: Partial<Record<TaskStatus, ColumnState>> = {};
    let counts: StatusCounts | undefined;
    let error: unknown = null;
    let anyData = false;
    for (const [status, query] of queries) {
      counts ??= query.data?.pages[0]?.counts;
      if (!open.has(status)) continue;
      if (query.data) anyData = true;
      if (query.isError && !query.data) error ??= query.error;
      columns[status] = {
        status,
        cards: cardsOf(query.data),
        hasMore: Boolean(query.hasNextPage),
        isLoading: query.isPending && query.fetchStatus !== 'idle',
        isFetchingMore: query.isFetchingNextPage,
        error: query.isError ? query.error : null,
        fetchMore: () => query.fetchNextPage(),
        refetch: () => query.refetch(),
      };
    }
    const isLoading = open.size > 0 ? !anyData && !error : todo.isPending;
    return {
      columns,
      counts,
      isLoading,
      error,
      refetch: () => {
        for (const [status, query] of queries) if (open.has(status)) void query.refetch();
      },
    };
  }, [dataKey, stateKey, open]);
}
