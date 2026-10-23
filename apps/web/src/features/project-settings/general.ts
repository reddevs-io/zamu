// The General form of project settings: what changed, and how API errors map onto its fields. Moved
// here from the Edit project dialog, which this page replaces; the key is editable now too.
import { ORPCError } from '@orpc/client';
import type { Project } from '@pm/contracts';

export type GeneralField = 'name' | 'key' | 'description' | 'repository' | 'usesMilestones';

export type GeneralProject = Pick<
  Project,
  'key' | 'name' | 'description' | 'usesMilestones' | 'usesCycles' | 'repository'
> & { locked?: Project['locked'] };

export interface GeneralValues {
  name: string;
  key: string;
  description: string;
  repository: string;
  usesMilestones: boolean;
  usesCycles: boolean;
}

export interface GeneralChanges {
  key?: string;
  name?: string;
  description?: string | null;
  /** null unlinks the repository. */
  repository?: string | null;
  usesMilestones?: boolean;
  usesCycles?: boolean;
}

export function initialValues(project: GeneralProject): GeneralValues {
  return {
    name: project.name,
    key: project.key,
    description: project.description ?? '',
    repository: project.repository ?? '',
    usesMilestones: project.usesMilestones,
    usesCycles: project.usesCycles,
  };
}

/** Only the fields that differ from the project. */
export function projectChanges(project: GeneralProject, values: GeneralValues): GeneralChanges {
  const name = values.name.trim();
  const key = values.key.trim().toUpperCase();
  const description = values.description.trim() || null;
  const repository = values.repository.trim() || null;
  return {
    ...(key !== project.key ? { key } : {}),
    ...(name !== project.name ? { name } : {}),
    ...(description !== (project.description ?? null) ? { description } : {}),
    ...(repository !== (project.repository ?? null) ? { repository } : {}),
    ...(values.usesMilestones !== project.usesMilestones ? { usesMilestones: values.usesMilestones } : {}),
    ...(values.usesCycles !== project.usesCycles ? { usesCycles: values.usesCycles } : {}),
  };
}

export interface GeneralFailure {
  field?: GeneralField;
  message: string;
}

const FIELDS = new Set<string>(['name', 'key', 'description', 'repository', 'usesMilestones']);

type Issue = { path: string; message: string };

/** Turns a projects.update error into a field error or a banner message. */
export function generalFailure(error: unknown): GeneralFailure {
  if (error instanceof ORPCError) {
    if (error.code === 'FORBIDDEN') return { message: "You don't have permission to change this project." };
    if (error.code === 'UNAUTHORIZED') return { message: 'Your session ended. Sign in again to save.' };
    if (error.code === 'NOT_FOUND') return { message: 'This project no longer exists.' };
    const data = error.data as { issues?: Issue[]; field?: string } | undefined;
    // PROJECT_MIRRORED and the other 409s name the locked field.
    if (data?.field && FIELDS.has(data.field)) {
      return { field: data.field as GeneralField, message: error.message };
    }
    const issue = data?.issues?.find((item) => FIELDS.has(item.path.split('.')[0] ?? ''));
    if (issue) return { field: (issue.path.split('.')[0] ?? 'name') as GeneralField, message: issue.message };
    if (error.code === 'CONFLICT' && /key/i.test(error.message))
      return { field: 'key', message: error.message };
    if (error.code === 'BAD_REQUEST' || error.code === 'UNPROCESSABLE_CONTENT' || error.code === 'CONFLICT') {
      return { message: error.message || 'Check the fields and try again.' };
    }
  }
  return { message: "Couldn't save the project. Check your connection and try again." };
}

/** Why the key can't change, or null when it can. */
export function keyLockReason(project: GeneralProject, hasTasks: boolean | undefined): string | null {
  if (hasTasks) return "Task keys embed it, and this project has tasks, so it can't change.";
  if (project.locked?.includes('key')) {
    return "Task keys come from the Backlog.md files while the project reads them, so it can't change.";
  }
  // Unknown yet: keep it fixed until the task count arrives.
  if (hasTasks === undefined) return "Task keys embed it, so it can't change while the project has tasks.";
  return null;
}
