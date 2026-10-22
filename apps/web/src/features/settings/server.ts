// TanStack Start server functions for the settings screens. Members, invitations, agents and keys are
// not part of /api/v1 in M1, so the screens call @pm/core through these thin adapters: validate the
// input with the contract schema, build the actor from the request, call core, return the result.
// Handler bodies (and the server-only imports they use) are stripped from the client bundle.
import {
  AuthId,
  CreateAgentInput,
  CreateApiKeyInput,
  CreateInvitationInput,
  RevokeApiKeyInput,
  UserId,
} from '@pm/contracts';
import {
  type Actor,
  type CoreContext,
  cancelInvitation,
  createAgent,
  createApiKey,
  createInvitation,
  listApiKeys,
  listInvitations,
  removeMember,
  revokeApiKey,
} from '@pm/core';
import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import { z } from 'zod';
import { getServerContext } from '../../server/context';
import { runForRequest } from './adapter';

/** Same shape as core's ListApiKeysInput, built from contract primitives to keep core out of the client. */
export const ListApiKeysInput = z.object({
  owner: z.union([z.literal('all'), z.literal('me'), UserId]),
});
const RemoveMemberInput = z.object({ userId: UserId });
const CancelInvitationInput = z.object({ id: AuthId });

function run<T>(service: (core: CoreContext, actor: Actor) => Promise<T>) {
  return runForRequest(getServerContext(), new Headers(getRequestHeaders()), service);
}

export const listInvitationsFn = createServerFn({ method: 'GET' }).handler(() =>
  run((core, actor) => listInvitations(core, actor)),
);

export const createInvitationFn = createServerFn({ method: 'POST' })
  .validator(CreateInvitationInput)
  .handler(({ data }) => run((core, actor) => createInvitation(core, actor, data)));

export const cancelInvitationFn = createServerFn({ method: 'POST' })
  .validator(CancelInvitationInput)
  .handler(({ data }) => run((core, actor) => cancelInvitation(core, actor, data)));

export const createAgentFn = createServerFn({ method: 'POST' })
  .validator(CreateAgentInput)
  .handler(({ data }) => run((core, actor) => createAgent(core, actor, data)));

export const removeMemberFn = createServerFn({ method: 'POST' })
  .validator(RemoveMemberInput)
  .handler(({ data }) => run((core, actor) => removeMember(core, actor, data)));

export const listApiKeysFn = createServerFn({ method: 'GET' })
  .validator(ListApiKeysInput)
  .handler(({ data }) => run((core, actor) => listApiKeys(core, actor, data)));

export const createApiKeyFn = createServerFn({ method: 'POST' })
  .validator(CreateApiKeyInput)
  .handler(({ data }) => run((core, actor) => createApiKey(core, actor, data)));

export const revokeApiKeyFn = createServerFn({ method: 'POST' })
  .validator(RevokeApiKeyInput)
  .handler(({ data }) => run((core, actor) => revokeApiKey(core, actor, data)));
