// Typed /api/v1 client: the contract from @zamu/contracts over OpenAPILink (plain REST + JSON), with
// Problem bodies decoded into ORPCErrors that carry the contract's codes.
import { createORPCClient } from '@orpc/client';
import type { ContractRouterClient } from '@orpc/contract';
import { OpenAPILink } from '@orpc/openapi-client/fetch';
import { type Contract, contract, decodeProblem } from '@zamu/contracts';
import pkg from '../package.json' with { type: 'json' };
import type { FetchLike } from './io';

export type ApiClient = ContractRouterClient<Contract>;

export const USER_AGENT = `zamu/${pkg.version}`;

export interface ClientOptions {
  /** Server origin (the contract paths already start with /api/v1). */
  url: string;
  key: string;
  fetch?: FetchLike;
}

export function createApiClient({ url, key, fetch }: ClientOptions): ApiClient {
  const link = new OpenAPILink(contract, {
    url,
    headers: { authorization: `Bearer ${key}`, 'user-agent': USER_AGENT, accept: 'application/json' },
    customErrorResponseBodyDecoder: (body) => decodeProblem(body),
    ...(fetch ? { fetch: (request: Request) => fetch(request) } : {}),
  });
  return createORPCClient<ApiClient>(link);
}
