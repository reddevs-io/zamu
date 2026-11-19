// TanStack Start server functions for the settings screens. Members, invitations, agents and keys are
// not part of /api/v1 in M1, so the screens call @zamu/core through these thin adapters: validate the
// input with the contract schema, build the actor from the request, call core, return the result.
// Handler bodies (and the server-only imports they use) are stripped from the client bundle.

import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import {
  CancelInvitationInput,
  CreateAgentInput,
  CreateApiKeyInput,
  CreateInvitationInput,
  ListApiKeysInput,
  RemoveMemberInput,
  RevokeApiKeyInput,
} from '@zamu/contracts';
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
} from '@zamu/core';
import { getServerContext } from '../../server/context';
import { runForRequest } from './adapter';

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
