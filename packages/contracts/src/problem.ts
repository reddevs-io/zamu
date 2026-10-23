import { z } from 'zod';
import { Task } from './entities';

/**
 * Error codes shared by core, the API, the web app and the CLI. They match oRPC's common error
 * codes, so an ORPCError can be turned into a Problem (and back) by code alone.
 */
export const PROBLEM_CODES = [
  'BAD_REQUEST',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  /** A task write with an ifUpdatedAt older than the stored task. The body carries the current task. */
  'TASK_CHANGED',
  'UNPROCESSABLE_CONTENT',
  'INTERNAL_SERVER_ERROR',
] as const;
export const ProblemCode = z.enum(PROBLEM_CODES);
export type ProblemCode = z.infer<typeof ProblemCode>;

export const PROBLEM_STATUS: Record<ProblemCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  TASK_CHANGED: 409,
  UNPROCESSABLE_CONTENT: 422,
  INTERNAL_SERVER_ERROR: 500,
};

export const PROBLEM_TITLES: Record<ProblemCode, string> = {
  BAD_REQUEST: 'Bad request',
  UNAUTHORIZED: 'Not signed in',
  FORBIDDEN: 'Not allowed',
  NOT_FOUND: 'Not found',
  CONFLICT: 'Conflict',
  TASK_CHANGED: 'Task changed',
  UNPROCESSABLE_CONTENT: 'Invalid input',
  INTERNAL_SERVER_ERROR: 'Server error',
};

/** One failed validation rule. path is dotted (`assignee`, `scope.projects.0`); empty for the root. */
export const ProblemIssue = z.object({
  path: z.string(),
  message: z.string(),
});
export type ProblemIssue = z.infer<typeof ProblemIssue>;

/** Extra data carried by contract errors (the `data` of an ORPCError). */
export const ProblemData = z.object({
  requestId: z.string().optional(),
  issues: z.array(ProblemIssue).optional(),
  /** TASK_CHANGED only: the task as it is now. */
  task: Task.optional(),
});
export type ProblemData = z.infer<typeof ProblemData>;

/**
 * Error body of every /api/v1 response with a 4xx or 5xx status, after RFC 9457 (problem details)
 * with four extensions: `code`, `requestId`, `issues`, and `task` for TASK_CHANGED. The CLI prints
 * it under `pm.v1.error`.
 */
export const Problem = z.object({
  type: z.string().default('about:blank'),
  title: z.string(),
  status: z.number().int().min(400).max(599),
  code: ProblemCode,
  detail: z.string().optional(),
  instance: z.string().optional(),
  requestId: z.string().optional(),
  issues: z.array(ProblemIssue).optional(),
  /** TASK_CHANGED only: the task as it is now, so the client can roll back to it. */
  task: Task.optional(),
});
export type Problem = z.output<typeof Problem>;

/** Builds a Problem with the standard title and status for a code. */
export function problem(
  code: ProblemCode,
  detail?: string,
  extra: { requestId?: string; issues?: ProblemIssue[]; instance?: string; task?: Problem['task'] } = {},
): Problem {
  return {
    type: 'about:blank',
    title: PROBLEM_TITLES[code],
    status: PROBLEM_STATUS[code],
    code,
    ...(detail === undefined ? {} : { detail }),
    ...extra,
  };
}

/** Converts Zod (or Standard Schema) issues into Problem issues. */
export function toProblemIssues(
  issues: readonly { path?: readonly (PropertyKey | { key: PropertyKey })[]; message: string }[],
): ProblemIssue[] {
  return issues.map((issue) => ({
    path: (issue.path ?? [])
      .map((segment) => (typeof segment === 'object' ? segment.key : segment))
      .map(String)
      .join('.'),
    message: issue.message,
  }));
}

/** JSON Schema of Problem, for OpenAPIGenerator's `customErrorResponseBodySchema` option. */
export const problemJsonSchema = (() => {
  const { $schema: _dialect, ...schema } = z.toJSONSchema(Problem, { io: 'output' });
  return schema;
})();
