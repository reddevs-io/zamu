// Every failure the CLI reports becomes a CliError: a Problem (printed as pm.v1.error with --json)
// plus the process exit code. Scripts and agents branch on the exit code, so it is part of the
// stable interface:
//   0 ok, 1 usage, 2 auth, 3 not found, 4 forbidden, 5 server.
import { ORPCError } from '@orpc/client';
import { type Problem, type ProblemCode, type ProblemIssue, problem, toProblemIssues } from '@pm/contracts';
import { ZodError } from 'zod';

export const EXIT = {
  ok: 0,
  usage: 1,
  auth: 2,
  notFound: 3,
  forbidden: 4,
  server: 5,
} as const;

export type ExitCode = (typeof EXIT)[keyof typeof EXIT];

export class CliError extends Error {
  readonly problem: Problem;
  readonly exitCode: ExitCode;
  /** Extra lines printed under the message in human output (hints, issue lists). */
  readonly hints: string[];

  constructor(problemBody: Problem, exitCode: ExitCode, hints: string[] = [], message?: string) {
    super(message ?? problemBody.detail ?? problemBody.title);
    this.name = 'CliError';
    this.problem = problemBody;
    this.exitCode = exitCode;
    this.hints = hints;
  }
}

/** Exit code for an HTTP status (Problem status or raw response status). */
export function exitCodeForStatus(status: number): ExitCode {
  if (status === 401) return EXIT.auth;
  if (status === 403) return EXIT.forbidden;
  if (status === 404) return EXIT.notFound;
  if (status >= 500) return EXIT.server;
  return EXIT.usage;
}

/** A mistake in how the command was called (bad flag value, missing argument). */
export function usageError(detail: string, issues?: ProblemIssue[], hints: string[] = []): CliError {
  return new CliError(problem('BAD_REQUEST', detail, issues?.length ? { issues } : {}), EXIT.usage, hints);
}

/** No credentials, or credentials the server refused. */
export function authError(detail: string, hints: string[] = []): CliError {
  return new CliError(problem('UNAUTHORIZED', detail), EXIT.auth, hints);
}

export function notFoundError(detail: string, hints: string[] = []): CliError {
  return new CliError(problem('NOT_FOUND', detail), EXIT.notFound, hints);
}

/** The server could not be reached or answered with something the contract does not describe. */
export function serverError(detail: string, status = 500): CliError {
  return new CliError({ ...problem('INTERNAL_SERVER_ERROR', detail), status }, EXIT.server);
}

/** Validation failure of command input against a contract schema (before anything is sent). */
export function inputError(error: ZodError, detail = 'Invalid arguments'): CliError {
  const issues = toProblemIssues(error.issues);
  return usageError(
    detail,
    issues,
    issues.map((issue) => (issue.path ? `${issue.path}: ${issue.message}` : issue.message)),
  );
}

const PROBLEM_CODE_SET = new Set<string>([
  'BAD_REQUEST',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'TASK_CHANGED',
  'UNPROCESSABLE_CONTENT',
  'INTERNAL_SERVER_ERROR',
] satisfies ProblemCode[]);

function errorChain(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; current instanceof Error && depth < 4; depth++) {
    // Node reports a refused connection as an AggregateError (one error per address) with no message.
    const inner: Error =
      current instanceof AggregateError && !current.message && current.errors[0] instanceof Error
        ? current.errors[0]
        : current;
    const code = (inner as { code?: unknown }).code;
    const message = inner.message || (typeof code === 'string' ? code : inner.name);
    parts.push(typeof code === 'string' && !message.includes(code) ? `${message} (${code})` : message);
    current = inner.cause;
  }
  return parts.join(': ');
}

/** Turns whatever a command threw into a CliError. `url` names the server in network errors. */
export function toCliError(error: unknown, url?: string): CliError {
  if (error instanceof CliError) return error;

  if (error instanceof ORPCError) {
    const status = typeof error.status === 'number' ? error.status : 500;
    const code: ProblemCode = PROBLEM_CODE_SET.has(error.code)
      ? (error.code as ProblemCode)
      : status >= 500
        ? 'INTERNAL_SERVER_ERROR'
        : 'BAD_REQUEST';
    const data = error.data as { requestId?: unknown; issues?: unknown; task?: unknown } | undefined;
    const requestId = typeof data?.requestId === 'string' ? data.requestId : undefined;
    const issues = Array.isArray(data?.issues) ? (data.issues as ProblemIssue[]) : undefined;
    // TASK_CHANGED carries the task as it is now. decodeProblem already validated it.
    const task = code === 'TASK_CHANGED' && data?.task ? (data.task as Problem['task']) : undefined;
    const body: Problem = {
      ...problem(code, error.message || undefined, {
        ...(requestId ? { requestId } : {}),
        ...(issues?.length ? { issues } : {}),
        ...(task ? { task } : {}),
      }),
      status: status >= 400 && status <= 599 ? status : 500,
    };
    // An issue that only repeats the message (a conflict on one field) adds nothing to it.
    const hints = (issues ?? [])
      .filter((issue) => issue.message !== error.message)
      .map((issue) => (issue.path ? `${issue.path}: ${issue.message}` : issue.message));
    if (requestId) hints.push(`Request id: ${requestId}`);
    // The server's 401 text speaks to HTTP clients; people at a terminal get the CLI's version.
    const message =
      status === 401
        ? 'The server did not accept the API key. It may be revoked, expired or mistyped.'
        : undefined;
    if (status === 401) hints.unshift('Run pm login --key <key> with a valid key, or fix PM_KEY.');
    return new CliError(body, exitCodeForStatus(status), hints, message);
  }

  if (error instanceof ZodError) {
    // A response that does not match the contract: the server and the CLI disagree on the API.
    return serverError(
      `The server sent a response this version of pm does not understand: ${error.issues[0]?.message ?? 'invalid data'}`,
    );
  }

  if (error instanceof TypeError && /fetch failed|Failed to fetch|NetworkError/i.test(error.message)) {
    return serverError(`Could not reach ${url ?? 'the server'}: ${errorChain(error.cause ?? error)}`, 503);
  }

  return serverError(errorChain(error) || 'Unexpected error');
}
