import { type QueryClient, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  CreateCycleInput,
  CreateMilestoneInput,
  CycleSelector,
  EndCycleInput,
  UpdateCycleInput,
  UpdateMilestoneInput,
} from '@zamu/contracts';
import type { z } from 'zod';
import { retryOnce } from '~/features/tasks/errors';
import { client, orpc } from '~/lib/orpc';

// Data for the milestone and cycle screens, through the same /api/v1 client the CLI uses.
// Writes refresh every list a milestone or cycle shows up in: the planning lists, the task lists (chips,
// filters, counts) and the projects list (the header's Cycles tab note).

/** Every milestone of a project. Same input as the project header's tab count, so they share a cache entry. */
export const milestonesQuery = (projectKey: string) =>
  orpc.milestones.list.queryOptions({ input: { project: projectKey }, retry: retryOnce });

export const milestoneQuery = (id: string) =>
  orpc.milestones.get.queryOptions({ input: { id }, retry: retryOnce });

/** Every cycle of a project, oldest first. */
export const cyclesQuery = (projectKey: string) =>
  orpc.cycles.list.queryOptions({ input: { project: projectKey }, retry: retryOnce });

/** One cycle by number, or the current or next one. */
export const cycleQuery = (projectKey: string, number: CycleSelector) =>
  orpc.cycles.get.queryOptions({ input: { project: projectKey, number }, retry: retryOnce });

export function invalidatePlanning(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: orpc.milestones.key() }),
    queryClient.invalidateQueries({ queryKey: orpc.cycles.key() }),
    queryClient.invalidateQueries({ queryKey: orpc.tasks.key() }),
    queryClient.invalidateQueries({ queryKey: orpc.projects.key() }),
  ]);
}

export function useCreateMilestone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: z.input<typeof CreateMilestoneInput>) => client.milestones.create(input),
    onSuccess: (milestone) => {
      queryClient.setQueryData(orpc.milestones.get.queryKey({ input: { id: milestone.id } }), milestone);
      void invalidatePlanning(queryClient);
    },
  });
}

export function useUpdateMilestone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: z.input<typeof UpdateMilestoneInput>) => client.milestones.update(input),
    onSuccess: (milestone) => {
      queryClient.setQueryData(orpc.milestones.get.queryKey({ input: { id: milestone.id } }), milestone);
      void invalidatePlanning(queryClient);
    },
  });
}

export function useDeleteMilestone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => client.milestones.delete({ id }),
    onSuccess: (_result, id) => {
      queryClient.removeQueries({ queryKey: orpc.milestones.get.key({ input: { id } }) });
      void invalidatePlanning(queryClient);
    },
  });
}

export function useCreateCycle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: z.input<typeof CreateCycleInput>) => client.cycles.create(input),
    onSuccess: () => void invalidatePlanning(queryClient),
  });
}

export function useUpdateCycle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: z.input<typeof UpdateCycleInput>) => client.cycles.update(input),
    onSuccess: () => void invalidatePlanning(queryClient),
  });
}

export function useEndCycle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: z.input<typeof EndCycleInput>) => client.cycles.end(input),
    onSuccess: () => void invalidatePlanning(queryClient),
  });
}

/** Moves tasks into a cycle ("Add tasks" on a cycle page). */
export function useAddToCycle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ key, cycle }: { key: string; cycle: number }) => client.tasks.update({ key, cycle }),
    onSuccess: () => void invalidatePlanning(queryClient),
  });
}
