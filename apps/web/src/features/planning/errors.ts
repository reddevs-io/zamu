import { ORPCError } from '@orpc/client';
import type { z } from 'zod';

// Turns a failed write into a message on one dialog field, or a sentence for the dialog's banner.

export interface WriteFailure<F extends string> {
  field?: F;
  message: string;
}

interface Issue {
  path: string;
  message: string;
}

export function writeFailure<F extends string>(
  error: unknown,
  fields: readonly F[],
  what: string,
  conflict?: WriteFailure<F>,
): WriteFailure<F> {
  if (error instanceof ORPCError) {
    if (error.code === 'CONFLICT')
      return conflict ?? { message: error.message || `Couldn't save the ${what}.` };
    if (error.code === 'FORBIDDEN') return { message: `You don't have permission to change ${what}s here.` };
    if (error.code === 'UNAUTHORIZED') return { message: 'Your session ended. Sign in again.' };
    if (error.code === 'NOT_FOUND') return { message: `This ${what} no longer exists.` };
    const issues = (error.data as { issues?: Issue[] } | undefined)?.issues;
    const issue = issues?.find((item) => fields.includes(item.path.split('.')[0] as F));
    if (issue) return { field: issue.path.split('.')[0] as F, message: issue.message };
    if (error.code === 'BAD_REQUEST' || error.code === 'UNPROCESSABLE_CONTENT') {
      return { message: error.message || 'Check the fields and try again.' };
    }
  }
  return { message: `Couldn't save the ${what}. Check your connection and try again.` };
}

/** First issue per field of a failed contract parse. */
export function fieldErrors<F extends string>(
  error: z.ZodError,
  fields: readonly F[],
): Partial<Record<F, string>> {
  const errors: Partial<Record<F, string>> = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field !== 'string' || !fields.includes(field as F)) continue;
    errors[field as F] ??= issue.message;
  }
  return errors;
}
