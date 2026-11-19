// TanStack Query wiring for the Git connections page. Connections are settings-only data, so every
// call goes through the server functions in ./server and comes back as a SettingsResult. Tokens are
// sent, never received.

import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  CreateGitConnectionInput,
  DeleteGitConnectionInput,
  GitConnection,
  GitConnectionDeleted,
  GitConnectionList,
  GitConnectionTestResult,
  TestGitConnectionInput,
  UpdateGitConnectionInput,
} from '@zamu/contracts';
import type { z } from 'zod';
import { orpc } from '~/lib/orpc';
import { SettingsError, unwrap } from '../settings/result';

/** Loaded on first use, so jsdom tests of these screens do not pull server-only modules in. */
const server = () => import('./server');

export const connectionsKey = ['connections'] as const;

/** Errors the server answered on purpose (forbidden, not found) do not get better on retry. */
const retry = (failures: number, error: unknown) => !(error instanceof SettingsError) && failures < 2;

/** Every connection of the workspace with `usedBy` and `encryptionReady`. */
export const connectionsQuery = () =>
  queryOptions({
    queryKey: [...connectionsKey, 'list'],
    queryFn: async (): Promise<GitConnectionList> => unwrap((await server()).listConnectionsFn()),
    retry,
  });

/** Refetches the list and the project shapes (a paused or resumed mirror changes their summary). */
function useInvalidate() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: connectionsKey }),
      queryClient.invalidateQueries({ queryKey: orpc.projects.key() }),
    ]);
}

export function useCreateConnection() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: z.input<typeof CreateGitConnectionInput>): Promise<GitConnection> =>
      unwrap((await server()).createConnectionFn({ data: input })),
    onSuccess: invalidate,
  });
}

export function useUpdateConnection() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: z.input<typeof UpdateGitConnectionInput>): Promise<GitConnection> =>
      unwrap((await server()).updateConnectionFn({ data: input })),
    onSuccess: invalidate,
  });
}

export function useDeleteConnection() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: z.input<typeof DeleteGitConnectionInput>): Promise<GitConnectionDeleted> =>
      unwrap((await server()).deleteConnectionFn({ data: input })),
    onSettled: invalidate,
  });
}

/** Tests a token. A saved connection's own test stores the result, so the list refetches then. */
export function useTestConnection() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: z.input<typeof TestGitConnectionInput>): Promise<GitConnectionTestResult> =>
      unwrap((await server()).testConnectionFn({ data: input })),
    onSuccess: (_result, input) => {
      if ('id' in input && !input.token) void invalidate();
    },
  });
}
