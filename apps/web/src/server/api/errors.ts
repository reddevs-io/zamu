// Turns anything a procedure throws into an ORPCError whose code, status and data match the
// contract's error map, so every transport (OpenAPI, RPC, server-side calls) reports the same thing.
import { ORPCError } from '@orpc/server';
import { PROBLEM_STATUS, type ProblemCode, ProblemData } from '@pm/contracts';
import { isCoreError } from '@pm/core';

function withRequestId(data: unknown, requestId: string | undefined): ProblemData {
  const parsed = ProblemData.safeParse(data);
  const base = parsed.success ? parsed.data : {};
  return requestId ? { ...base, requestId } : base;
}

/**
 * Core errors become their Problem code (NotFound 404, Forbidden 403, Conflict 409, Invalid 422).
 * oRPC errors (input validation 400, our own 401) keep their code and gain the request id.
 * Anything else is logged and becomes a 500 without internal details.
 */
export function toApiError(error: unknown, requestId?: string): ORPCError<string, ProblemData> {
  if (isCoreError(error)) {
    const code: ProblemCode = error.code;
    return new ORPCError(code, {
      status: PROBLEM_STATUS[code],
      message: error.message,
      data: { ...(requestId ? { requestId } : {}), ...(error.issues ? { issues: error.issues } : {}) },
      cause: error,
    });
  }
  if (error instanceof ORPCError) {
    return new ORPCError(error.code, {
      status: error.status,
      message: error.message,
      data: withRequestId(error.data, requestId),
      // Keeps a ValidationError cause, which encodeProblem turns into issues.
      cause: error.cause,
    });
  }
  console.error(`api: unhandled error${requestId ? ` (request ${requestId})` : ''}:`, error);
  return new ORPCError('INTERNAL_SERVER_ERROR', {
    status: 500,
    message: 'Something went wrong on the server',
    data: withRequestId(undefined, requestId),
    cause: error,
  });
}
