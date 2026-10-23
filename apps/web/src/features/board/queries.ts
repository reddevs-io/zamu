import type { ListTasksInput, TaskListPage, TaskStatus } from '@pm/contracts';
import {
  type InfiniteData,
  infiniteQueryOptions,
  type QueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import type { z } from 'zod';
import { retryOnce, withTimeout } from '~/features/tasks/errors';
import { REQUEST_TIMEOUT_MS } from '~/features/tasks/queries';
import { client, orpc } from '~/lib/orpc';

// One query per board column: tasks.list with order=board and one status, 50 cards per page, more on
// scroll. The keys sit under orpc.tasks.list.key(), so every task change that invalidates lists (the
// panel, quick create) refreshes the board too. They end with BOARD_TAG so board code can find them.

export const BOARD_PAGE_SIZE = 50;
export const BOARD_TAG = 'board';

export type BoardInput = Omit<z.input<typeof ListTasksInput>, 'limit' | 'cursor'> & {
  project: string[];
  status: TaskStatus[];
};

export type BoardColumnData = InfiniteData<TaskListPage, unknown>;

export function boardColumnKey(input: BoardInput): QueryKey {
  return [...orpc.tasks.list.key({ type: 'infinite', input }), BOARD_TAG];
}

export function boardColumnQuery(input: BoardInput) {
  return infiniteQueryOptions({
    queryKey: boardColumnKey(input),
    queryFn: ({ pageParam, signal }): Promise<TaskListPage> =>
      client.tasks.list(
        { ...input, limit: BOARD_PAGE_SIZE, ...(typeof pageParam === 'string' ? { cursor: pageParam } : {}) },
        { signal: withTimeout(signal, REQUEST_TIMEOUT_MS) },
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: TaskListPage) => last.nextCursor ?? undefined,
    retry: retryOnce,
    // Keep the cards on screen while new filters load, within the same project and column.
    placeholderData: (previous, previousQuery) => {
      const before = inputOf(previousQuery?.queryKey);
      return before && sameColumn(before, input) ? previous : undefined;
    },
  });
}

/** The tasks.list input stored in a board query key. */
export function inputOf(queryKey: QueryKey | undefined): BoardInput | undefined {
  const meta = queryKey?.[1] as { input?: BoardInput } | undefined;
  return meta?.input;
}

function sameColumn(a: BoardInput, b: BoardInput): boolean {
  return a.project.join(',') === b.project.join(',') && a.status.join(',') === b.status.join(',');
}

/** Every cached board column of a project, with its status. */
export function boardQueries(
  queryClient: QueryClient,
  projectKey: string,
): { queryKey: QueryKey; status: TaskStatus; data: BoardColumnData }[] {
  const found = queryClient.getQueriesData<BoardColumnData>({
    queryKey: orpc.tasks.list.key(),
    predicate: (query) => query.queryKey.at(-1) === BOARD_TAG,
  });
  const result: { queryKey: QueryKey; status: TaskStatus; data: BoardColumnData }[] = [];
  for (const [queryKey, data] of found) {
    const input = inputOf(queryKey);
    const status = input?.status[0];
    if (!data || !status || !input?.project.includes(projectKey)) continue;
    result.push({ queryKey, status, data });
  }
  return result;
}

/** Refetches the project's board columns (after moves settle). */
export async function invalidateBoard(queryClient: QueryClient, projectKey: string) {
  const isBoard = (queryKey: QueryKey) =>
    queryKey.at(-1) === BOARD_TAG && (inputOf(queryKey)?.project.includes(projectKey) ?? false);
  // A first load still running (a column unfolded by the move) started before the move was saved:
  // drop it, or the refetch below would reuse its answer.
  await queryClient.cancelQueries({
    queryKey: orpc.tasks.list.key(),
    predicate: (query) => isBoard(query.queryKey) && query.state.data === undefined,
  });
  await queryClient.invalidateQueries({
    queryKey: orpc.tasks.list.key(),
    predicate: (query) => isBoard(query.queryKey),
  });
}
