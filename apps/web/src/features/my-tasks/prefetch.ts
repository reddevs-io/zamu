import type { QueryClient } from '@tanstack/react-query';
import { meQuery, projectsQuery, taskListQuery } from '~/features/tasks/queries';
import { filtersOf, listInput, type MyTasksSearch } from './search';

/** Requests the My tasks route loader starts: the list under the current filters, projects and me. */
export function prefetchMyTasks(queryClient: QueryClient, search: MyTasksSearch) {
  return Promise.all([
    queryClient.prefetchQuery(taskListQuery(listInput(filtersOf(search)))),
    queryClient.prefetchQuery(projectsQuery()),
    queryClient.prefetchQuery(meQuery()),
  ]);
}
