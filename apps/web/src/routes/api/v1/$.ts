import { createFileRoute } from '@tanstack/react-router';
import { handleApiRequest } from '../../../server/api';

// /api/v1/*: REST routes from @pm/contracts, the OpenAPI document at /api/v1/openapi.json and the
// RPC endpoint the web app's browser client uses (/api/v1/rpc/*). See server/api/handler.ts.

function handle({ request }: { request: Request }) {
  return handleApiRequest(request);
}

export const Route = createFileRoute('/api/v1/$')({
  server: {
    handlers: {
      GET: handle,
      HEAD: handle,
      POST: handle,
      PUT: handle,
      PATCH: handle,
      DELETE: handle,
    },
  },
});
