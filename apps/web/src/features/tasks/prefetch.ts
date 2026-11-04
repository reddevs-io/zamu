import { parseBacklogId, safeParseTaskKey, TASK_STATUSES } from '@pm/contracts';
import type { QueryClient } from '@tanstack/react-query';
import { boardColumnInput, boardColumnQuery } from '~/features/board/queries';
import { labelsQuery } from '~/features/labels/queries';
import { defaultDisplayOptions } from '~/features/views/display-options';
import { orpc } from '~/lib/orpc';
import { isClientError } from './errors';
import { backlogHistoryQuery } from './MirroredTask';
import { membersQuery, meQuery, projectsQuery, taskListQuery, taskQuery, timelineQuery } from './queries';
import {
  BOARD_FOLDED,
  listMainInput,
  type TaskListSearch,
  taskFilterOf,
  withProjectFeatures,
} from './search';

// Route loaders start these requests. The server awaits them so the first HTML already has the list
// (or the board); in the browser they run in the background, so moving the selection never waits on a
// loader. Each request is the one the screen makes with the default display options (the server can't
// read the options saved in local storage), so a fresh page reuses the answer instead of asking again.

export function prefetchTaskList(queryClient: QueryClient, projectKey: string, search: TaskListSearch) {
  return Promise.all([
    search.view === 'board'
      ? prefetchBoard(queryClient, projectKey, search)
      : prefetchList(queryClient, projectKey, search),
    queryClient.prefetchQuery(projectsQuery()),
    queryClient.prefetchQuery(membersQuery()),
    prefetchLabels(queryClient, projectKey),
  ]);
}

/**
 * The list's main request (TaskListScreen): the eager groups under the filter. Milestone and cycle
 * filters only count while the project uses them, so it reads the project first (cached by the shell).
 */
async function prefetchList(queryClient: QueryClient, projectKey: string, search: TaskListSearch) {
  const projects = await queryClient.ensureQueryData(projectsQuery()).catch(() => null);
  const project = projects?.items.find((item) => item.key === projectKey);
  const filter = withProjectFeatures(taskFilterOf(search), project);
  const input = listMainInput(projectKey, filter, defaultDisplayOptions('list'), search.hidden === 'only');
  await queryClient.prefetchQuery(taskListQuery(input));
}

/** The columns a fresh board shows open (BoardScreen): all but Done and Canceled, or the filtered ones. */
function prefetchBoard(queryClient: QueryClient, projectKey: string, search: TaskListSearch) {
  const filter = taskFilterOf(search);
  const options = defaultDisplayOptions('board');
  const open = TASK_STATUSES.filter((status) =>
    filter.status?.length ? filter.status.includes(status) : !BOARD_FOLDED.includes(status),
  );
  return Promise.all(
    open.map((status) =>
      queryClient.prefetchInfiniteQuery(
        boardColumnQuery(boardColumnInput(projectKey, filter, options, status)),
      ),
    ),
  );
}

/**
 * The project's labels, so L opens the label picker filled. Browser only: the first HTML doesn't need
 * them, and the server answer stays as small as before.
 */
export function prefetchLabels(queryClient: QueryClient, projectKey: string | undefined) {
  if (import.meta.env.SSR || !projectKey) return null;
  return queryClient.prefetchQuery(labelsQuery(projectKey.toUpperCase()));
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
    prefetchLabels(queryClient, safeParseTaskKey(taskKey.toUpperCase())?.projectKey),
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
