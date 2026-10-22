import type { QueryClient } from '@tanstack/react-query';
import { activityQuery, membersQuery, meQuery, projectsQuery, taskListQuery, taskQuery } from './queries';
import { eagerStatuses, filtersOf, listInput, type TaskListSearch } from './search';

// Route loaders start these requests. The server awaits them so the first HTML already has the list;
// in the browser they run in the background, so moving the selection never waits on a loader.

export function prefetchTaskList(queryClient: QueryClient, projectKey: string, search: TaskListSearch) {
  const filters = filtersOf(search);
  return Promise.all([
    queryClient.prefetchQuery(taskListQuery(listInput(projectKey, filters, eagerStatuses(filters)))),
    queryClient.prefetchQuery(projectsQuery()),
    queryClient.prefetchQuery(membersQuery()),
    search.task ? queryClient.prefetchQuery(taskQuery(search.task)) : null,
    search.task ? queryClient.prefetchQuery(activityQuery(search.task)) : null,
  ]);
}

export function prefetchTaskPage(queryClient: QueryClient, taskKey: string) {
  return Promise.all([
    queryClient.prefetchQuery(taskQuery(taskKey)),
    queryClient.prefetchQuery(activityQuery(taskKey)),
    queryClient.prefetchQuery(projectsQuery()),
    queryClient.prefetchQuery(membersQuery()),
    queryClient.prefetchQuery(meQuery()),
  ]);
}

/** Awaits on the server only. */
export async function settleOnServer(work: Promise<unknown>): Promise<void> {
  if (import.meta.env.SSR) await work;
  else void work;
}
