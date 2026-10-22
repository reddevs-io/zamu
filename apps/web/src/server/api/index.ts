// Public surface of the /api/v1 server: the HTTP handler, the router and a server-side client.
import { createRouterClient, type RouterClient } from '@orpc/server';
import type { CoreContext } from '@pm/core';
import { getServerContext } from '../context';
import { type ApiFetchHandler, createApiFetchHandler } from './handler';
import { type ApiRouter, router } from './router';

export type { ApiContext, AuthedContext } from './base';
export { toApiError } from './errors';
export { type ApiFetchHandler, createApiFetchHandler, RPC_PREFIX } from './handler';
export { generateOpenApiDocument, getOpenApiDocument, OPENAPI_PATH } from './openapi';
export { type ApiRouter, router } from './router';

/** Typed client of the router, as returned by createApiClient and the web app's isomorphic client. */
export type ApiClient = RouterClient<ApiRouter>;

let handler: ApiFetchHandler | undefined;

/** Handles one /api/v1 request with the process-wide ServerContext. */
export function handleApiRequest(request: Request): Promise<Response> {
  handler ??= createApiFetchHandler(getServerContext());
  return handler(request);
}

/**
 * Calls the router in-process (no HTTP) with the same middleware, auth and error mapping as HTTP
 * requests. `getHeaders` runs on every call and returns the caller's request headers (cookie or
 * Authorization). Used for SSR and server functions.
 */
export function createApiClient(
  getHeaders: () => Headers,
  getCore: () => CoreContext = getServerContext,
): ApiClient {
  return createRouterClient(router, {
    context: () => ({ core: getCore(), headers: getHeaders(), requestId: crypto.randomUUID() }),
  });
}
