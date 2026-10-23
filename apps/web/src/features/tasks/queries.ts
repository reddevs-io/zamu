import {
  type AssigneeRef,
  type CreateTaskInput,
  type CycleRef,
  type ListTasksInput,
  MAX_TASK_LIST_LIMIT,
  type MilestoneRef,
  type Priority,
  type StatusCounts,
  type Task,
  type TaskListItem,
  type TaskStatus,
} from '@pm/contracts';
import { type QueryClient, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import type { z } from 'zod';
import { client, orpc } from '~/lib/orpc';
import { retryOnce, withTimeout } from './errors';

// Data for the task screens. Lists load every page (300 tasks are two requests), so grouping, counts and
// J/K always see the whole project. Edits are optimistic and roll back when the server refuses them.

/** A request that has not answered after this long shows the error banner. */
export const REQUEST_TIMEOUT_MS = 20_000;

export interface TaskListData {
  items: TaskListItem[];
  counts: StatusCounts;
}

type ListInput = Omit<z.input<typeof ListTasksInput>, 'limit' | 'cursor'>;

/** Fetches every page of tasks.list for one filter set. */
export async function fetchAllTasks(input: ListInput, signal?: AbortSignal): Promise<TaskListData> {
  const items: TaskListItem[] = [];
  let counts: StatusCounts | undefined;
  let cursor: string | undefined;
  do {
    const page = await client.tasks.list(
      { ...input, limit: MAX_TASK_LIST_LIMIT, ...(cursor ? { cursor } : {}) },
      { signal },
    );
    items.push(...page.items);
    counts ??= page.counts;
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return { items, counts: counts ?? emptyCounts() };
}

export function emptyCounts(): StatusCounts {
  return { backlog: 0, todo: 0, in_progress: 0, in_review: 0, done: 0, canceled: 0 };
}

/** Every task of a project matching `input`, across pages. Keyed under orpc.tasks.list for invalidation. */
export function taskListQuery(input: ListInput) {
  return queryOptions({
    queryKey: [...orpc.tasks.list.key({ type: 'query', input }), 'all-pages'] as const,
    queryFn: ({ signal }) => fetchAllTasks(input, withTimeout(signal, REQUEST_TIMEOUT_MS)),
    retry: retryOnce,
    // Keep the previous rows on screen while a new search or filter loads, within the same project.
    placeholderData: (previous, previousQuery) => {
      const previousInput = (previousQuery?.queryKey[1] as { input?: ListInput } | undefined)?.input;
      return previousInput?.project === input.project ? previous : undefined;
    },
  });
}

export function taskQuery(key: string) {
  return orpc.tasks.get.queryOptions({
    input: { key },
    retry: retryOnce,
  });
}

export function activityQuery(key: string) {
  return orpc.tasks.activity.queryOptions({ input: { key }, retry: retryOnce });
}

/** Activity and comments of a task, oldest first. */
export function timelineQuery(key: string) {
  return orpc.tasks.timeline.queryOptions({ input: { key }, retry: retryOnce });
}

/** Milestones of a project, with progress, for the milestone pickers. */
export function milestonesQuery(project: string) {
  return orpc.milestones.list.queryOptions({ input: { project }, retry: retryOnce });
}

/** Cycles of a project, oldest first, for the cycle pickers. */
export function cyclesQuery(project: string) {
  return orpc.cycles.list.queryOptions({ input: { project }, retry: retryOnce });
}

export const projectsQuery = () => orpc.projects.list.queryOptions({ retry: retryOnce });
export const membersQuery = () => orpc.members.list.queryOptions({ retry: retryOnce, staleTime: 60_000 });
export const meQuery = () => orpc.me.get.queryOptions({ retry: retryOnce, staleTime: 5 * 60_000 });

// ---------------------------------------------------------------------------
// Optimistic edits
// ---------------------------------------------------------------------------

/** Fields an edit can change, with the assignee as the full reference the screens display. */
export interface TaskPatch {
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: Priority;
  assignee?: AssigneeRef | null;
  /** The new milestone (sent as its id), or null to clear it. */
  milestone?: MilestoneRef | null;
  /** The new cycle (sent as its number), or null to clear it. */
  cycle?: CycleRef | null;
}

export interface UpdateTaskVariables {
  key: string;
  patch: TaskPatch;
}

function isListData(value: unknown): value is TaskListData {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as TaskListData).items) &&
    typeof (value as TaskListData).counts === 'object'
  );
}

function listFields(patch: TaskPatch): Partial<TaskListItem> {
  const { description: _description, ...rest } = patch;
  return rest;
}

/** Applies a patch to one cached list: the row's fields, and the per-status counts when the status moves. */
export function patchList(
  data: TaskListData,
  key: string,
  patch: TaskPatch,
  previousStatus: TaskStatus | undefined,
  updatedAt: string,
): TaskListData {
  const items = data.items.map((item) =>
    item.key === key ? { ...item, ...listFields(patch), updatedAt } : item,
  );
  let counts = data.counts;
  if (patch.status && previousStatus && patch.status !== previousStatus) {
    counts = {
      ...counts,
      [previousStatus]: Math.max(0, counts[previousStatus] - 1),
      [patch.status]: counts[patch.status] + 1,
    };
  }
  return { ...data, items, counts };
}

function toUpdateInput({ key, patch }: UpdateTaskVariables) {
  return {
    key,
    ...(patch.title !== undefined ? { title: patch.title } : {}),
    ...(patch.description !== undefined ? { description: patch.description } : {}),
    ...(patch.status !== undefined ? { status: patch.status } : {}),
    ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
    ...(patch.assignee !== undefined ? { assignee: patch.assignee?.id ?? null } : {}),
    ...(patch.milestone !== undefined ? { milestone: patch.milestone?.id ?? null } : {}),
    ...(patch.cycle !== undefined ? { cycle: patch.cycle?.number ?? null } : {}),
  };
}

interface Snapshot {
  task: Task | undefined;
  lists: [readonly unknown[], unknown][];
}

/**
 * Invalidates everything a task change can affect: the task, its activity and timeline, lists, project
 * counts, and milestone and cycle progress.
 */
export function invalidateTask(queryClient: QueryClient, key: string) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: orpc.tasks.get.key({ input: { key } }) }),
    queryClient.invalidateQueries({ queryKey: orpc.tasks.activity.key({ input: { key } }) }),
    queryClient.invalidateQueries({ queryKey: orpc.tasks.timeline.key({ input: { key } }) }),
    queryClient.invalidateQueries({ queryKey: orpc.tasks.list.key() }),
    queryClient.invalidateQueries({ queryKey: orpc.projects.key() }),
    queryClient.invalidateQueries({ queryKey: orpc.milestones.key() }),
    queryClient.invalidateQueries({ queryKey: orpc.cycles.key() }),
  ]);
}

/**
 * Saves task edits. The cached task and every cached list change at once; on error both go back to what
 * they were, and the mutation's `error` explains why.
 */
export function useUpdateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: orpc.tasks.update.mutationKey(),
    mutationFn: (variables: UpdateTaskVariables) => client.tasks.update(toUpdateInput(variables)),
    onMutate: async ({ key, patch }): Promise<Snapshot> => {
      const taskKey = orpc.tasks.get.queryKey({ input: { key } });
      const listKey = orpc.tasks.list.key();
      await Promise.all([
        queryClient.cancelQueries({ queryKey: taskKey }),
        queryClient.cancelQueries({ queryKey: listKey }),
      ]);
      const task = queryClient.getQueryData(taskKey);
      const lists = queryClient.getQueriesData({ queryKey: listKey }) as [readonly unknown[], unknown][];
      const previousStatus =
        task?.status ??
        lists.flatMap(([, data]) => (isListData(data) ? data.items : [])).find((item) => item.key === key)
          ?.status;
      const updatedAt = new Date().toISOString();
      if (task) queryClient.setQueryData(taskKey, { ...task, ...patch, updatedAt });
      for (const [queryKey, data] of lists) {
        if (isListData(data)) {
          queryClient.setQueryData(queryKey, patchList(data, key, patch, previousStatus, updatedAt));
        }
      }
      return { task, lists };
    },
    onError: (_error, { key }, snapshot) => {
      if (!snapshot) return;
      if (snapshot.task) queryClient.setQueryData(orpc.tasks.get.queryKey({ input: { key } }), snapshot.task);
      for (const [queryKey, data] of snapshot.lists) queryClient.setQueryData(queryKey, data);
    },
    onSuccess: (task) => {
      queryClient.setQueryData(orpc.tasks.get.queryKey({ input: { key: task.key } }), task);
    },
    // Not awaited: the rollback and the error show at once instead of after the refetch.
    onSettled: (_task, _error, { key }) => {
      void invalidateTask(queryClient, key);
    },
  });
}

/** Creates a task, primes its detail cache and refreshes lists and project counts. */
export function useCreateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: orpc.tasks.create.mutationKey(),
    mutationFn: (input: z.input<typeof CreateTaskInput>) => client.tasks.create(input),
    onSuccess: (task) => {
      queryClient.setQueryData(orpc.tasks.get.queryKey({ input: { key: task.key } }), task);
      // Not awaited: the dialog can take the next task while the list refreshes.
      void queryClient.invalidateQueries({ queryKey: orpc.tasks.list.key() });
      void queryClient.invalidateQueries({ queryKey: orpc.projects.key() });
      void queryClient.invalidateQueries({ queryKey: orpc.milestones.key() });
      void queryClient.invalidateQueries({ queryKey: orpc.cycles.key() });
    },
  });
}
