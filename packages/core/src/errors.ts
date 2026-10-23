// Typed errors thrown by core services. Adapters map them to Problem responses by `code`
// (NotFound 404, Forbidden 403, Conflict 409, TaskChanged 409, Invalid 422); see PROBLEM_STATUS in
// @pm/contracts.
import type { ProblemCode, ProblemIssue, Task } from '@pm/contracts';
import { toProblemIssues } from '@pm/contracts';
import { ZodError } from 'zod';

export type CoreErrorCode = Extract<
  ProblemCode,
  'NOT_FOUND' | 'FORBIDDEN' | 'CONFLICT' | 'TASK_CHANGED' | 'UNPROCESSABLE_CONTENT'
>;

export abstract class CoreError extends Error {
  abstract readonly code: CoreErrorCode;
  /** Field-level problems, for Invalid. */
  readonly issues?: ProblemIssue[];

  constructor(message: string, options?: { issues?: ProblemIssue[]; cause?: unknown }) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = new.target.name;
    if (options?.issues) this.issues = options.issues;
  }
}

/** The resource does not exist in the caller's workspace. */
export class NotFound extends CoreError {
  readonly code = 'NOT_FOUND' as const;
}

/** The caller is a member but may not do this (role, key scope or key access). */
export class Forbidden extends CoreError {
  readonly code = 'FORBIDDEN' as const;
}

/** The change conflicts with the current state (duplicate key, renaming a project with tasks). */
export class Conflict extends CoreError {
  readonly code = 'CONFLICT' as const;
}

/**
 * A task write sent an ifUpdatedAt older than the stored task: someone else changed it meanwhile.
 * Adapters put `task` (the current version) into the problem data.
 */
export class TaskChanged extends CoreError {
  readonly code = 'TASK_CHANGED' as const;
  readonly task: Task;

  constructor(task: Task, message = `${task.key} changed since you loaded it`) {
    super(message);
    this.task = task;
  }
}

/** The input is well-formed but not acceptable (unknown assignee, project outside the workspace). */
export class Invalid extends CoreError {
  readonly code = 'UNPROCESSABLE_CONTENT' as const;

  static fromZod(error: ZodError, message = 'Invalid input'): Invalid {
    return new Invalid(message, { issues: toProblemIssues(error.issues), cause: error });
  }
}

export function isCoreError(error: unknown): error is CoreError {
  return error instanceof CoreError;
}

/** Parses `value` with `schema`, turning a ZodError into Invalid. */
export function parseInput<T>(schema: { parse: (value: unknown) => T }, value: unknown): T {
  try {
    return schema.parse(value);
  } catch (error) {
    if (error instanceof ZodError) throw Invalid.fromZod(error);
    throw error;
  }
}

/** The Postgres error behind a Drizzle error, if any. */
function pgError(error: unknown): { code?: string; constraint?: string } | null {
  let current: unknown = error;
  for (let depth = 0; current && depth < 5; depth++) {
    if (typeof current === 'object' && current !== null && 'code' in current) {
      const { code, constraint } = current as { code?: unknown; constraint?: unknown };
      if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) {
        return { code, constraint: typeof constraint === 'string' ? constraint : undefined };
      }
    }
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}

/** True for a unique violation, optionally on a named constraint or index. */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const pg = pgError(error);
  return pg?.code === '23505' && (constraint === undefined || pg.constraint === constraint);
}
