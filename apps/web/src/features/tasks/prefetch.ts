import { parseBacklogId, safeParseTaskKey } from '@pm/contracts';
import type { QueryClient } from '@tanstack/react-query';
import { boardColumnQuery } from '~/features/board/queries';
import { orpc } from '~/lib/orpc';
import { isClientError } from './errors';
import { backlogHistoryQuery } from './MirroredTask';
import { membersQuery, meQuery, projectsQuery, taskListQuery, taskQuery, timelineQuery } from './queries';
import {
  BOARD_FOLDED,
  boardInput,
  boardStatuses,
  eagerStatuses,
  filtersOf,
  listInput,
  type TaskListSearch,
} from './search';

// Route loaders start these requests. The server awaits them so the first HTML already has the list
// (or the board); in the browser they run in the background, so moving the selection never waits on a
// loader.

export function prefetchTaskList(queryClient: QueryClient, projectKey: string, search: TaskListSearch) {
  const filters = filtersOf(search);
  return Promise.all([
    ...(search.view === 'board'
      ? prefetchBoard(queryClient, projectKey, search)
      : [queryClient.prefetchQuery(taskListQuery(listInput(projectKey, filters, eagerStatuses(filters))))]),
    queryClient.prefetchQuery(projectsQuery()),
    queryClient.prefetchQuery(membersQuery()),
    search.task ? queryClient.prefetchQuery(taskQuery(search.task)) : null,
    // The detail pane shows the timeline (activity and comments) of the selected task.
    search.task ? queryClient.prefetchQuery(timelineQuery(search.task)) : null,
  ]);
}

/** The columns a fresh board shows open: all but Done and Canceled, and Backlog while a task is open. */
function prefetchBoard(queryClient: QueryClient, projectKey: string, search: TaskListSearch) {
  const filters = filtersOf(search);
  const open = boardStatuses(filters).filter(
    (status) => (filters.status || !BOARD_FOLDED.includes(status)) && !(search.task && status === 'backlog'),
  );
  return open.map((status) =>
    queryClient.prefetchInfiniteQuery(boardColumnQuery(boardInput(projectKey, filters, status))),
  );
}

export function prefetchTaskPage(queryClient: QueryClient, taskKey: string) {
  return Promise.all([
    queryClient.prefetchQuery(taskQuery(taskKey)).then(() => {
      // A task from Backlog.md also shows the project's first read and detach in its history.
      const task = queryClient.getQueryData(taskQuery(taskKey).queryKey);
      return task?.backlog ? queryClient.prefetchQuery(backlogHistoryQuery(task.project.key)) : undefined;
    }),
    queryClient.prefetchQuery(timelineQuery(taskKey)),
    queryClient.prefetchQuery(projectsQuery()),
    queryClient.prefetchQuery(membersQuery()),
    queryClient.prefetchQuery(meQuery()),
  ]);
}

/**
 * Where /p/$projectKey/$taskKey should point: the same path for a task key of that project (any case is
 * upper-cased), the task's own key for a Backlog.md ID (BACK-786.1, back-007) or another project's
 * key, null when there is no such task.
 */
export async function canonicalTaskPath(
  queryClient: QueryClient,
  projectKeyParam: string,
  taskKeyParam: string,
): Promise<{ projectKey: string; taskKey: string } | null> {
  const projectKey = projectKeyParam.toUpperCase();
  const key = taskKeyParam.trim().toUpperCase();
  const parts = safeParseTaskKey(key);
  if (parts && parts.projectKey === projectKey) return { projectKey, taskKey: key };
  if (!parts && !parseBacklogId(key)) return null;
  try {
    const task = await queryClient.fetchQuery(
      orpc.tasks.get.queryOptions({ input: { key, project: projectKey }, retry: false }),
    );
    queryClient.setQueryData(taskQuery(task.key).queryKey, task);
    return { projectKey: task.project.key, taskKey: task.key };
  } catch (error) {
    if (isClientError(error)) return null;
    throw error;
  }
}

/** Awaits on the server only. */
export async function settleOnServer(work: Promise<unknown>): Promise<void> {
  if (import.meta.env.SSR) await work;
  else void work;
}
