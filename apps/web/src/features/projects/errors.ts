import { ORPCError } from '@orpc/client';
import type { NewProjectFailure } from './NewProjectDialog';
import type { NewProjectField } from './validation';

const FIELDS = new Set<string>(['name', 'key', 'description', 'repository']);
const REPOSITORY = new Set<string>(['repository']);

type Issue = { path: string; message: string };

/** The first problem issue whose path starts with one of `fields`. */
function fieldIssue(error: ORPCError<string, unknown>, fields: Set<string>): Issue | undefined {
  const issues = (error.data as { issues?: Issue[] } | undefined)?.issues;
  return issues?.find((item) => fields.has(item.path.split('.')[0] ?? ''));
}

const fieldOf = (issue: Issue) => issue.path.split('.')[0] ?? '';

/** Turns a projects.create error into a field error (key or repository taken) or a banner message. */
export function newProjectFailure(error: unknown, key: string): NewProjectFailure {
  if (error instanceof ORPCError) {
    if (error.code === 'CONFLICT') {
      // The repository conflict names its field; any other conflict is the key.
      const issue = fieldIssue(error, REPOSITORY);
      if (issue) return { field: 'repository', message: issue.message };
      return { field: 'key', message: `${key} is already used by another project. Pick another key.` };
    }
    if (error.code === 'FORBIDDEN') {
      return { message: "You don't have permission to create projects in this workspace." };
    }
    if (error.code === 'UNAUTHORIZED') {
      return { message: 'Your session ended. Sign in again to create the project.' };
    }
    const issue = fieldIssue(error, FIELDS);
    if (issue) return { field: fieldOf(issue) as NewProjectField, message: issue.message };
    if (error.code === 'BAD_REQUEST' || error.code === 'UNPROCESSABLE_CONTENT') {
      return { message: error.message || 'Check the fields and try again.' };
    }
  }
  return { message: "Couldn't create the project. Check your connection and try again." };
}
