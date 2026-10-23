// TanStack Query wiring for the Backlog.md setup. Setup data goes through the backlog and connection
// server functions (settings-only data); the project, its task count and the members come from
// /api/v1 through oRPC.
import type {
  BacklogDetection,
  BacklogMappings,
  BacklogPreview,
  BacklogSourceStatus,
  GitConnectionList,
} from '@pm/contracts';
import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import { listConnectionsFn } from '~/features/connections/server';
import { SettingsError, unwrap } from '~/features/settings/result';
import { orpc } from '~/lib/orpc';
import { backlogSettingsStatusFn, detectBacklogFn, previewBacklogFn } from '../backlog/server';
import { READING_STATES } from './phase';

const setupKey = ['backlog-setup'] as const;

/** Errors the server answered on purpose (forbidden, not found) do not get better on retry. */
const retry = (failures: number, error: unknown) => !(error instanceof SettingsError) && failures < 1;

export const connectionsQuery = () =>
  queryOptions({
    queryKey: ['connections', 'list'],
    queryFn: (): Promise<GitConnectionList> => unwrap(listConnectionsFn()),
    retry,
  });

export interface DetectionKey {
  projectKey: string;
  connectionId: string;
  folderOverride?: string | undefined;
}

/** Step 2: reads the repository (no writes). Kept for a while: Mappings reuses it. */
export const detectionQuery = (input: DetectionKey) =>
  queryOptions({
    queryKey: [...setupKey, 'detect', input.projectKey, input.connectionId, input.folderOverride ?? null],
    queryFn: (): Promise<BacklogDetection> =>
      unwrap(
        detectBacklogFn({
          data: {
            projectKey: input.projectKey,
            connectionId: input.connectionId,
            ...(input.folderOverride ? { folderOverride: input.folderOverride } : {}),
          },
        }),
      ),
    staleTime: 5 * 60_000,
    retry,
  });

/** Step 4: a dry run with the mappings (no writes). */
export const previewQuery = (input: DetectionKey & { mappings: BacklogMappings }) =>
  queryOptions({
    queryKey: [
      ...setupKey,
      'preview',
      input.projectKey,
      input.connectionId,
      input.folderOverride ?? null,
      input.mappings,
    ],
    queryFn: (): Promise<BacklogPreview> =>
      unwrap(
        previewBacklogFn({
          data: {
            projectKey: input.projectKey,
            connectionId: input.connectionId,
            mappings: input.mappings,
            ...(input.folderOverride ? { folderOverride: input.folderOverride } : {}),
          },
        }),
      ),
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
    retry,
  });

/**
 * The project's source, if any (NOT_FOUND before start). Polls every 2 seconds while the first
 * read runs.
 */
export const sourceStatusQuery = (projectKey: string) =>
  queryOptions({
    queryKey: [...setupKey, 'status', projectKey],
    queryFn: (): Promise<BacklogSourceStatus> => unwrap(backlogSettingsStatusFn({ data: { projectKey } })),
    retry,
    refetchInterval: (query) => {
      const state = query.state.data?.state;
      return state && READING_STATES.has(state) ? 2_000 : false;
    },
  });

/** Every task of the project (hidden ones too), to refuse setup on a project that has some. */
export const projectTaskCountQuery = (projectKey: string) =>
  orpc.tasks.list.queryOptions({
    input: { project: projectKey, hidden: 'include', limit: 1 },
    select: (page) => Object.values(page.counts).reduce((sum, value) => sum + value, 0),
  });

export const projectsQuery = () => orpc.projects.list.queryOptions();
export const membersQuery = () => orpc.members.list.queryOptions({ staleTime: 60_000 });

/** Query keys the setup invalidates after start or a mappings save. */
export const setupQueryKey = setupKey;
