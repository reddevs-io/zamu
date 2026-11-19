import type { QueryClient } from '@tanstack/react-query';
import type { CycleSelector } from '@zamu/contracts';
import { membersQuery, projectsQuery, taskListQuery } from '~/features/tasks/queries';
import { defaultDisplayOptions, type TaskFilter } from '~/features/views';
import { cycleQuery, cyclesQuery, milestoneQuery, milestonesQuery } from './queries';
import { planningListInput } from './usePlanningTasks';

// Route loaders of the milestone and cycle screens. The server awaits them so the first HTML has the
// data; in the browser they run in the background. Task lists use the default Display options: the
// person's own live in localStorage, which the server cannot read.

export function prefetchMilestones(queryClient: QueryClient, projectKey: string) {
  return Promise.all([
    queryClient.prefetchQuery(milestonesQuery(projectKey)),
    queryClient.prefetchQuery(projectsQuery()),
  ]);
}

function prefetchPlanningTasks(
  queryClient: QueryClient,
  projectKey: string,
  scope: { milestone: string } | { cycle: number },
  filter: TaskFilter,
) {
  return Promise.all([
    queryClient.prefetchQuery(
      taskListQuery(planningListInput(projectKey, scope, filter, defaultDisplayOptions('list'))),
    ),
    queryClient.prefetchQuery(taskListQuery(planningListInput(projectKey, scope, {}))),
  ]);
}

export function prefetchMilestone(
  queryClient: QueryClient,
  projectKey: string,
  id: string,
  filter: TaskFilter,
) {
  return Promise.all([
    queryClient.prefetchQuery(milestoneQuery(id)),
    prefetchPlanningTasks(queryClient, projectKey, { milestone: id }, filter),
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

export function prefetchCycle(
  queryClient: QueryClient,
  projectKey: string,
  selector: CycleSelector,
  filter: TaskFilter = {},
) {
  return Promise.all([
    queryClient.prefetchQuery(cycleQuery(projectKey, selector)),
    queryClient.prefetchQuery(cyclesQuery(projectKey)),
    ...(typeof selector === 'number'
      ? [prefetchPlanningTasks(queryClient, projectKey, { cycle: selector }, filter)]
      : []),
    queryClient.prefetchQuery(projectsQuery()),
    queryClient.prefetchQuery(membersQuery()),
  ]);
}

/** Awaits on the server only. */
export async function settleOnServer(work: Promise<unknown>): Promise<void> {
  if (import.meta.env.SSR) await work;
  else void work;
}
