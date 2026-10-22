// The web app's /api/v1 client and TanStack Query helpers.
//
// On the server (SSR, loaders, server functions) the client calls the router in-process with the
// incoming request's headers, so there is no HTTP round trip to ourselves. In the browser it sends
// RPC requests to /api/v1/rpc with the session cookie. Both go through the same auth middleware and
// throw ORPCError with the contract's codes (UNAUTHORIZED, FORBIDDEN, NOT_FOUND, CONFLICT,
// UNPROCESSABLE_CONTENT, BAD_REQUEST) and ProblemData ({ requestId, issues }) as `data`.
//
//   const { data } = useQuery(orpc.projects.list.queryOptions());
//   const update = useMutation(orpc.tasks.update.mutationOptions());
//   await queryClient.invalidateQueries({ queryKey: orpc.tasks.key() });
import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import { createTanstackQueryUtils } from '@orpc/tanstack-query';
import { API_PREFIX } from '@pm/contracts';
import { createIsomorphicFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import { type ApiClient, createApiClient } from '../server/api';

/** Must match RPC_PREFIX in server/api/handler.ts (not imported: that module is server-only). */
const RPC_PATH = `${API_PREFIX}/rpc`;

const getClient = createIsomorphicFn()
  .server((): ApiClient => createApiClient(() => new Headers(getRequestHeaders())))
  .client((): ApiClient => createORPCClient(new RPCLink({ url: `${window.location.origin}${RPC_PATH}` })));

/** Typed /api/v1 client. Server calls read the current request's headers when they run. */
export const client: ApiClient = getClient();

/** TanStack Query options and keys for every procedure, e.g. orpc.tasks.list.queryOptions({ input }). */
export const orpc = createTanstackQueryUtils(client);
