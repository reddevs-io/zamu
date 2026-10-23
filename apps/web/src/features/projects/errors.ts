import { ORPCError } from '@orpc/client';
import type { NewProjectFailure } from './NewProjectDialog';
import type { NewProjectField } from './validation';

const FIELDS = new Set<string>(['name', 'key', 'description']);

/** Turns a projects.create error into a field error (key taken) or a banner message. */
export function newProjectFailure(error: unknown, key: string): NewProjectFailure {
  if (error instanceof ORPCError) {
    if (error.code === 'CONFLICT') {
      return { field: 'key', message: `${key} is already used by another project. Pick another key.` };
    }
    if (error.code === 'FORBIDDEN') {
      return { message: "You don't have permission to create projects in this workspace." };
    }
    if (error.code === 'UNAUTHORIZED') {
      return { message: 'Your session ended. Sign in again to create the project.' };
    }
    const issues = (error.data as { issues?: { path: string; message: string }[] } | undefined)?.issues;
    const issue = issues?.find((item) => FIELDS.has(item.path.split('.')[0] ?? ''));
    if (issue) return { field: issue.path.split('.')[0] as NewProjectField, message: issue.message };
    if (error.code === 'BAD_REQUEST' || error.code === 'UNPROCESSABLE_CONTENT') {
      return { message: error.message || 'Check the fields and try again.' };
    }
  }
  return { message: "Couldn't create the project. Check your connection and try again." };
}

/** Turns a projects.update error into a field error or a banner message. */
export function editProjectFailure(error: unknown): { field?: 'name' | 'description'; message: string } {
  if (error instanceof ORPCError) {
    if (error.code === 'FORBIDDEN') return { message: "You don't have permission to change this project." };
    if (error.code === 'UNAUTHORIZED') return { message: 'Your session ended. Sign in again to save.' };
    if (error.code === 'NOT_FOUND') return { message: 'This project no longer exists.' };
    const issues = (error.data as { issues?: { path: string; message: string }[] } | undefined)?.issues;
    const issue = issues?.find((item) => ['name', 'description'].includes(item.path.split('.')[0] ?? ''));
    if (issue) return { field: issue.path.split('.')[0] as 'name' | 'description', message: issue.message };
    if (error.code === 'BAD_REQUEST' || error.code === 'UNPROCESSABLE_CONTENT' || error.code === 'CONFLICT') {
      return { message: error.message || 'Check the fields and try again.' };
    }
  }
  return { message: "Couldn't save the project. Check your connection and try again." };
}
