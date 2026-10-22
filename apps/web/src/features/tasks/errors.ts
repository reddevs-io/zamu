import { ORPCError } from '@orpc/client';

// Turns a failed request into the sentence shown in the error banner, plus the request id an admin can
// look up in the server logs (from the Problem response, when the server sent one).

export interface LoadError {
  message: string;
  requestId?: string;
}

/** Name used for aborted-by-timeout requests (see `withTimeout`). */
export const TIMEOUT_ERROR = 'TimeoutError';

const nameOf = (value: unknown) =>
  typeof value === 'object' && value !== null ? (value as { name?: unknown }).name : undefined;

function isTimeout(error: unknown): boolean {
  if (nameOf(error) === TIMEOUT_ERROR) return true;
  return nameOf((error as { cause?: unknown } | null)?.cause) === TIMEOUT_ERROR;
}

export function requestIdOf(error: unknown): string | undefined {
  if (!(error instanceof ORPCError)) return undefined;
  const data = error.data as { requestId?: unknown } | undefined;
  return typeof data?.requestId === 'string' ? data.requestId : undefined;
}

/** "The server took too long to answer." and friends. */
export function describeError(error: unknown): LoadError {
  const requestId = requestIdOf(error);
  if (isTimeout(error)) return { message: 'The server took too long to answer.', requestId };
  if (error instanceof ORPCError) {
    switch (error.code) {
      case 'UNAUTHORIZED':
        return { message: 'Your session ended. Sign in again.', requestId };
      case 'FORBIDDEN':
        return { message: "You don't have access to this project.", requestId };
      case 'NOT_FOUND':
        return { message: 'This project or task does not exist.', requestId };
      case 'UNPROCESSABLE_CONTENT':
      case 'BAD_REQUEST':
      case 'CONFLICT':
        return { message: error.message || 'The server refused the change.', requestId };
      default:
        if (error.status === 504 || error.status === 408) {
          return { message: 'The server took too long to answer.', requestId };
        }
        if (error.status >= 500) return { message: 'The server ran into an error.', requestId };
        return { message: error.message || 'The request failed.', requestId };
    }
  }
  if (error instanceof TypeError) return { message: 'The server could not be reached.', requestId };
  return { message: 'Something went wrong.', requestId };
}

/** True for answers that will not change on retry (4xx). */
export function isClientError(error: unknown): boolean {
  return error instanceof ORPCError && error.status >= 400 && error.status < 500;
}

/** Retry server and network failures once; never retry 4xx answers. */
export function retryOnce(failureCount: number, error: unknown): boolean {
  return failureCount < 1 && !isClientError(error);
}

/** Combines TanStack Query's abort signal with a timeout, so a hung server ends in an error state. */
export function withTimeout(signal: AbortSignal | undefined, ms: number): AbortSignal {
  const timeout = AbortSignal.timeout(ms);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}
