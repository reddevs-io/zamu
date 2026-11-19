// TanStack Start server functions for the Git connections page (M3). Connections are settings-only
// data, not part of /api/v1, so the screens call @zamu/core through these thin adapters: validate with
// the contract schema, build the actor from the request, call core, return a SettingsResult (unwrap
// it in the browser with `unwrap` from features/settings/result). Tokens go in, never out.
// Handler bodies (and the server-only imports they use) are stripped from the client bundle.

import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import {
  CreateGitConnectionInput,
  DeleteGitConnectionInput,
  GitConnectionId,
  TestGitConnectionInput,
  UpdateGitConnectionInput,
} from '@zamu/contracts';
import {
  type Actor,
  type CoreContext,
  createConnection,
  deleteConnection,
  getConnection,
  listConnections,
  testConnection,
  updateConnection,
} from '@zamu/core';
import { z } from 'zod';
import { getServerContext } from '../../server/context';
import { runForRequest } from '../settings/adapter';

export const GetGitConnectionInput = z.object({ id: GitConnectionId });

function run<T>(service: (core: CoreContext, actor: Actor) => Promise<T>) {
  return runForRequest(getServerContext(), new Headers(getRequestHeaders()), service);
}

/** Every connection of the workspace (any member), with `usedBy` and `encryptionReady`. -> GitConnectionList */
export const listConnectionsFn = createServerFn({ method: 'GET' }).handler(() =>
  run((core, actor) => listConnections(core, actor)),
);

/** One connection (any member). -> GitConnection */
export const getConnectionFn = createServerFn({ method: 'GET' })
  .validator(GetGitConnectionInput)
  .handler(({ data }) => run((core, actor) => getConnection(core, actor, data.id)));

/**
 * Tests the token, then saves the connection (owners and admins). A token that does not work
 * saves nothing and fails with UNPROCESSABLE_CONTENT and an issue on `token` or `host`.
 * -> GitConnection
 */
export const createConnectionFn = createServerFn({ method: 'POST' })
  .validator(CreateGitConnectionInput)
  .handler(({ data }) => run((core, actor) => createConnection(core, actor, data)));

/** Renames and/or replaces the token (tested first). -> GitConnection */
export const updateConnectionFn = createServerFn({ method: 'POST' })
  .validator(UpdateGitConnectionInput)
  .handler(({ data }) => run((core, actor) => updateConnection(core, actor, data)));

/** Deletes it; mirrors that used it pause. -> GitConnectionDeleted ({ id, pausedProjects }) */
export const deleteConnectionFn = createServerFn({ method: 'POST' })
  .validator(DeleteGitConnectionInput)
  .handler(({ data }) => run((core, actor) => deleteConnection(core, actor, data)));

/**
 * Tests an unsaved token ({ provider, host, token }), a saved connection ({ id }, stores the result)
 * or a saved connection with a replacement token ({ id, token }). -> GitConnectionTestResult
 */
export const testConnectionFn = createServerFn({ method: 'POST' })
  .validator(TestGitConnectionInput)
  .handler(({ data }) => run((core, actor) => testConnection(core, actor, data)));
