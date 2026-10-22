// TanStack Query wiring for the settings screens. Reads of /api/v1 data (me, members, projects) go
// through oRPC; everything else calls the settings server functions. Created API keys are never put
// in the query cache: the secret lives only in the reveal dialog's state.
import type {
  ApiKeyCreated,
  ApiKeySummary,
  CreateApiKeyInput,
  CreateInvitationInput,
  Invitation,
} from '@pm/contracts';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import type { z } from 'zod';
import { orpc } from '~/lib/orpc';
import { SettingsError, unwrap } from './result';
import {
  cancelInvitationFn,
  createAgentFn,
  createApiKeyFn,
  createInvitationFn,
  type ListApiKeysInput,
  listApiKeysFn,
  listInvitationsFn,
  removeMemberFn,
  revokeApiKeyFn,
} from './server';
import type { AgentCreatedResult, CreateAgentValues } from './types';

export type KeyOwnerFilter = z.input<typeof ListApiKeysInput>['owner'];

const settingsKey = ['settings'] as const;

/** Errors the server answered on purpose (forbidden, not found) do not get better on retry. */
const retry = (failures: number, error: unknown) => !(error instanceof SettingsError) && failures < 2;

export const meQuery = () => orpc.me.get.queryOptions();
export const membersQuery = () => orpc.members.list.queryOptions();
export const projectsQuery = () => orpc.projects.list.queryOptions();

export const invitationsQuery = () =>
  queryOptions({
    queryKey: [...settingsKey, 'invitations'],
    queryFn: (): Promise<Invitation[]> => unwrap(listInvitationsFn()),
    retry,
  });

export const apiKeysQuery = (owner: KeyOwnerFilter) =>
  queryOptions({
    queryKey: [...settingsKey, 'api-keys', owner],
    queryFn: (): Promise<ApiKeySummary[]> => unwrap(listApiKeysFn({ data: { owner } })),
    retry,
  });

/** Refetches everything a members or keys change can affect. */
function useInvalidateSettings() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: settingsKey }),
      queryClient.invalidateQueries({ queryKey: orpc.members.key() }),
    ]);
}

export function useCreateInvitation() {
  const invalidate = useInvalidateSettings();
  return useMutation({
    mutationFn: (input: z.input<typeof CreateInvitationInput>) => unwrap(createInvitationFn({ data: input })),
    onSuccess: invalidate,
  });
}

export function useCancelInvitation() {
  const invalidate = useInvalidateSettings();
  return useMutation({
    mutationFn: (id: string) => unwrap(cancelInvitationFn({ data: { id } })),
    onSettled: invalidate,
  });
}

export function useRemoveMember() {
  const invalidate = useInvalidateSettings();
  return useMutation({
    mutationFn: (userId: string) => unwrap(removeMemberFn({ data: { userId } })),
    onSettled: invalidate,
  });
}

export function useRevokeApiKey() {
  const invalidate = useInvalidateSettings();
  return useMutation({
    mutationFn: (id: string) => unwrap(revokeApiKeyFn({ data: { id } })),
    onSettled: invalidate,
  });
}

/**
 * Creating agents and keys returns the secret once. These are plain async functions rather than
 * mutations so the secret never sits in a mutation cache entry; callers refetch the lists afterwards.
 */
export function useCreateAgent(): (values: CreateAgentValues) => Promise<AgentCreatedResult> {
  const invalidate = useInvalidateSettings();
  return async (values) => {
    const created = await unwrap(createAgentFn({ data: values }));
    void invalidate();
    return created;
  };
}

export function useCreateApiKey(): (input: z.input<typeof CreateApiKeyInput>) => Promise<ApiKeyCreated> {
  const invalidate = useInvalidateSettings();
  return async (input) => {
    const created = await unwrap(createApiKeyFn({ data: input }));
    void invalidate();
    return created;
  };
}
