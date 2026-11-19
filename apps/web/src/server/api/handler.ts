// The /api/v1 HTTP entry point, framework-free: (Request) => Response. The TanStack Start route
// (routes/api/v1/$.ts) and the tests call it; the CLI tests can pass it to OpenAPILink as `fetch`.
//
//   GET /api/v1/openapi.json   generated OpenAPI document
//   /api/v1/rpc/*              oRPC RPC protocol, used by the web app's browser client (lib/orpc.ts)
//   /api/v1/*                  REST routes from the contract (OpenAPI handler)
import { OpenAPIHandler } from '@orpc/openapi/fetch';
import { ORPCError } from '@orpc/server';
import { RPCHandler } from '@orpc/server/fetch';
import { bearerApiKey } from '@zamu/auth';
import { API_PREFIX, encodeProblem, type Problem, problem } from '@zamu/contracts';
import type { CoreContext } from '@zamu/core';
import type { ApiContext } from './base';
import { getOpenApiDocument, OPENAPI_PATH } from './openapi';
import { router } from './router';

export const RPC_PREFIX = `${API_PREFIX}/rpc` as const;

const REQUEST_ID_HEADER = 'x-request-id';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export type ApiFetchHandler = (request: Request) => Promise<Response>;

function requestIdOf(request: Request): string {
  const incoming = request.headers.get(REQUEST_ID_HEADER);
  return incoming && /^[\w.:-]{1,128}$/.test(incoming) ? incoming : crypto.randomUUID();
}

function problemResponse(body: Problem): Response {
  return Response.json(body, { status: body.status });
}

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * Cookie-authenticated writes must come from the app's own pages. Browsers send Origin on every
 * cross-site POST and PATCH; without this check a form on another site could post (the OpenAPI
 * handler also decodes form bodies) with the user's cookie. API-key requests carry no ambient
 * credentials and are not affected.
 */
function isCrossSiteWrite(request: Request, trustedOrigins: Set<string>): boolean {
  if (SAFE_METHODS.has(request.method)) return false;
  if (bearerApiKey(request.headers)) return false;
  const origin = request.headers.get('origin');
  if (origin !== null) return !trustedOrigins.has(origin);
  return request.headers.get('sec-fetch-site') === 'cross-site';
}

function finish(response: Response, requestId: string): Response {
  const headers = new Headers(response.headers);
  headers.set(REQUEST_ID_HEADER, requestId);
  headers.set('cache-control', 'no-store');
  if (response.status === 401) headers.set('www-authenticate', 'Bearer realm="api"');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

/** Builds the /api/v1 handler around one CoreContext (the process's, or a test database's). */
export function createApiFetchHandler(core: CoreContext): ApiFetchHandler {
  const openapi = new OpenAPIHandler<ApiContext>(router, {
    customErrorResponseBodyEncoder: (error) => encodeProblem(error),
  });
  const rpc = new RPCHandler<ApiContext>(router);
  const trustedOrigins = new Set([originOf(core.publicUrl)].filter((o): o is string => o !== null));

  return async (request) => {
    const requestId = requestIdOf(request);
    const { pathname } = new URL(request.url);
    const context: ApiContext = { core, headers: request.headers, requestId };

    try {
      if (pathname === OPENAPI_PATH) {
        if (request.method !== 'GET' && request.method !== 'HEAD') {
          return finish(problemResponse(problem('BAD_REQUEST', 'Use GET', { requestId })), requestId);
        }
        return finish(Response.json(await getOpenApiDocument()), requestId);
      }

      const origins = new Set(trustedOrigins);
      const own = originOf(request.url);
      if (own) origins.add(own);
      if (isCrossSiteWrite(request, origins)) {
        return finish(
          problemResponse(problem('FORBIDDEN', 'Cross-site requests are not allowed', { requestId })),
          requestId,
        );
      }

      const handler = pathname === RPC_PREFIX || pathname.startsWith(`${RPC_PREFIX}/`) ? rpc : openapi;
      const options = handler === rpc ? { context, prefix: RPC_PREFIX } : { context };
      const result = await handler.handle(request, options);
      if (result.matched) return finish(result.response, requestId);
      return finish(
        problemResponse(
          problem('NOT_FOUND', `No API route for ${request.method} ${pathname}`, { requestId }),
        ),
        requestId,
      );
    } catch (error) {
      // Procedure errors are encoded by the handlers; this only catches failures around them.
      console.error(`api: request ${requestId} failed:`, error);
      const body = encodeProblem(new ORPCError('INTERNAL_SERVER_ERROR', { status: 500 }), requestId);
      return finish(problemResponse(body), requestId);
    }
  };
}
