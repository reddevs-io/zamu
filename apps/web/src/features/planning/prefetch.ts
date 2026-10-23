import type { CycleSelector } from '@pm/contracts';
import type { QueryClient } from '@tanstack/react-query';
import { membersQuery, projectsQuery, taskListQuery } from '~/features/tasks/queries';
import { taskFilters } from './PlanningFilters';
import { cycleQuery, cyclesQuery, milestoneQuery, milestonesQuery } from './queries';
import type { PlanningTasksSearch } from './search';

// Route loaders of the milestone and cycle screens. The server awaits them so the first HTML has the
// data; in the browser they run in the background.

export function prefetchMilestones(queryClient: QueryClient, projectKey: string) {
  return Promise.all([
    queryClient.prefetchQuery(milestonesQuery(projectKey)),
    queryClient.prefetchQuery(projectsQuery()),
  ]);
}

export function prefetchMilestone(
  queryClient: QueryClient,
  projectKey: string,
  id: string,
  search: PlanningTasksSearch,
) {
  return Promise.all([
    queryClient.prefetchQuery(milestoneQuery(id)),
    queryClient.prefetchQuery(taskListQuery({ project: projectKey, milestone: id, ...taskFilters(search) })),
    queryClient.prefetchQuery(projectsQuery()),
    queryClient.prefetchQuery(membersQuery()),
  ]);
}

export function prefetchCycles(queryClient: QueryClient, projectKey: string) {
  return Promise.all([
    queryClient.prefetchQuery(cyclesQuery(projectKey)),
    queryClient.prefetchQuery(projectsQuery()),
  ]);
}

export function prefetchCycle(queryClient: QueryClient, projectKey: string, selector: CycleSelector) {
  return Promise.all([
    queryClient.prefetchQuery(cycleQuery(projectKey, selector)),
    queryClient.prefetchQuery(cyclesQuery(projectKey)),
    queryClient.prefetchQuery(projectsQuery()),
    queryClient.prefetchQuery(membersQuery()),
  ]);
}

/** Awaits on the server only. */
export async function settleOnServer(work: Promise<unknown>): Promise<void> {
  if (import.meta.env.SSR) await work;
  else void work;
}
