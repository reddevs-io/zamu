// What settings server functions return, and how the browser turns failures back into errors.
// Server functions return failures as data instead of throwing, so the code, message and field
// issues of core's errors reach the browser intact. This module is safe for the client bundle.
import type { ProblemCode, ProblemIssue } from '@pm/contracts';

export interface SettingsFailure {
  code: ProblemCode;
  message: string;
  issues: ProblemIssue[];
}

export type SettingsResult<T> = { ok: true; data: T } | { ok: false; error: SettingsFailure };

/** A failed settings call, thrown in the browser by `unwrap`. */
export class SettingsError extends Error {
  readonly code: ProblemCode;
  readonly issues: ProblemIssue[];

  constructor({ code, message, issues }: SettingsFailure) {
    super(message);
    this.name = 'SettingsError';
    this.code = code;
    this.issues = issues;
  }

  /** The message of the first issue on `path`, if any. */
  issueFor(path: string): string | undefined {
    return this.issues.find((issue) => issue.path === path || issue.path.startsWith(`${path}.`))?.message;
  }
}

/** Returns the data of a successful result, or throws SettingsError. */
export async function unwrap<T>(result: SettingsResult<T> | Promise<SettingsResult<T>>): Promise<T> {
  const settled = await result;
  if (settled.ok) return settled.data;
  throw new SettingsError(settled.error);
}

/** Human message for any error a settings screen can hit. */
export function errorMessage(error: unknown): string {
  if (error instanceof SettingsError) return error.message;
  return 'Something went wrong on the server. Try again.';
}
