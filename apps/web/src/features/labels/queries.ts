import { type QueryClient, useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateLabelInput, DeleteLabelInput, UpdateLabelInput } from '@zamu/contracts';
import type { z } from 'zod';
import { retryOnce } from '~/features/tasks/errors';
import { client, orpc } from '~/lib/orpc';

// Labels of a project (M5). Shared by the filter menu (features/views), the label picker
// (features/task-fields) and project settings, Labels. Writes refresh the label list and every task
// list, since rows and cards show label names and colours.

/** Every label of a project, with usage counts (hidden tasks left out). */
export const labelsQuery = (projectKey: string) =>
  orpc.labels.list.queryOptions({ input: { project: projectKey }, retry: retryOnce });

export function invalidateLabels(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: orpc.labels.key() }),
    queryClient.invalidateQueries({ queryKey: orpc.tasks.key() }),
    queryClient.invalidateQueries({ queryKey: orpc.home.key() }),
  ]);
}

export function useCreateLabel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: z.input<typeof CreateLabelInput>) => client.labels.create(input),
    onSuccess: () => void invalidateLabels(queryClient),
  });
}

export function useUpdateLabel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: z.input<typeof UpdateLabelInput>) => client.labels.update(input),
    onSuccess: () => void invalidateLabels(queryClient),
  });
}

export function useDeleteLabel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: z.input<typeof DeleteLabelInput>) => client.labels.delete(input),
    onSuccess: () => void invalidateLabels(queryClient),
  });
}
