// Typed errors for provider calls. Messages are written here, never copied from a provider response:
// some providers echo the token in their error bodies (Forgejo's 401 does), and tokens must never
// reach logs, API responses or activity.

export type GitProviderErrorKind =
  | 'unauthorized'
  | 'not_found'
  | 'rate_limited'
  | 'unreachable'
  | 'host_refused'
  | 'unexpected';

interface ErrorDetails {
  /** HTTP status of the provider response, when there was one. */
  status?: number | null;
  /** Short machine code: a Node network error code (ECONNREFUSED), `timeout`, `forbidden`… */
  code?: string | null;
}

export abstract class GitProviderError extends Error {
  abstract readonly kind: GitProviderErrorKind;
  readonly status: number | null;
  readonly code: string | null;

  constructor(message: string, details: ErrorDetails = {}) {
    super(message);
    this.status = details.status ?? null;
    this.code = details.code ?? null;
  }
}

/** The token is missing, invalid or expired (401), or lacks access to the resource (403, code `forbidden`). */
export class GitUnauthorized extends GitProviderError {
  readonly kind = 'unauthorized' as const;
  override readonly name = 'GitUnauthorized';
}

/** The repository, branch, commit or blob does not exist, or the token cannot see it. */
export class GitNotFound extends GitProviderError {
  readonly kind = 'not_found' as const;
  override readonly name = 'GitNotFound';
}

/** The provider asked to slow down. Retry after `retryAfterSeconds`. */
export class GitRateLimited extends GitProviderError {
  readonly kind = 'rate_limited' as const;
  override readonly name = 'GitRateLimited';
  readonly retryAfterSeconds: number;

  constructor(message: string, retryAfterSeconds: number, details: ErrorDetails = {}) {
    super(message, details);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** No usable answer: DNS, connection, TLS, timeout, or a 5xx from the provider. */
export class GitUnreachable extends GitProviderError {
  readonly kind = 'unreachable' as const;
  override readonly name = 'GitUnreachable';
}

/** The host resolves to an address the host policy refuses (private, link-local, metadata). */
export class GitHostRefused extends GitProviderError {
  readonly kind = 'host_refused' as const;
  override readonly name = 'GitHostRefused';
}

/** Anything else: an unexpected status, a response that does not have the documented shape. */
export class GitUnexpected extends GitProviderError {
  readonly kind = 'unexpected' as const;
  override readonly name = 'GitUnexpected';
}

export function isGitProviderError(error: unknown): error is GitProviderError {
  return error instanceof GitProviderError;
}
