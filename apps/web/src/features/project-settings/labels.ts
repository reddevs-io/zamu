// Project settings, Labels: order, copy and error text. The screen is LabelsSettings.tsx.
import { ORPCError } from '@orpc/client';
import { type LabelWithUsage, MAX_LABEL_NAME_LENGTH } from '@zamu/contracts';

const lower = (name: string) => name.toLocaleLowerCase();

/** Most used first (frame 116), then by name. */
export function sortLabels(labels: readonly LabelWithUsage[]): LabelWithUsage[] {
  return [...labels].sort(
    (a, b) => b.usageCount - a.usageCount || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  );
}

/** Labels whose name contains the query, ignoring case. */
export function filterLabels(labels: readonly LabelWithUsage[], query: string): LabelWithUsage[] {
  const needle = lower(query.trim());
  return needle ? labels.filter((label) => lower(label.name).includes(needle)) : [...labels];
}

/** The "Used on" cell: "12 tasks", "1 task", "No tasks". */
export function usageText(count: number): string {
  if (count === 0) return 'No tasks';
  return `${count} ${count === 1 ? 'task' : 'tasks'}`;
}

/** "12 labels", or "3 of 12 labels" while filtering. */
export function labelCountText(shown: number, total: number): string {
  const noun = total === 1 ? 'label' : 'labels';
  return shown === total ? `${total} ${noun}` : `${shown} of ${total} ${noun}`;
}

/** "Payments has a label named “backend” already." */
export function labelExistsText(projectName: string, name: string): string {
  return `${projectName} has a label named “${name}” already.`;
}

/**
 * What's wrong with a name before it is sent, or null. `exceptId` is the label being renamed (a change of
 * case only is a rename, not a clash).
 */
export function labelNameError(
  name: string,
  labels: readonly Pick<LabelWithUsage, 'id' | 'name'>[],
  projectName: string,
  exceptId?: string,
): string | null {
  const trimmed = name.trim();
  if (!trimmed) return 'Enter a name.';
  if (trimmed.length > MAX_LABEL_NAME_LENGTH) return `Use ${MAX_LABEL_NAME_LENGTH} characters or fewer.`;
  const clash = labels.find((label) => label.id !== exceptId && lower(label.name) === lower(trimmed));
  return clash ? labelExistsText(projectName, clash.name) : null;
}

/** Text of a failed create, rename, recolour or delete. */
export function labelFailure(error: unknown, projectName: string, name: string): string {
  if (error instanceof ORPCError) {
    if (error.code === 'LABEL_EXISTS') return labelExistsText(projectName, name.trim());
    if (error.code === 'LABEL_MIRRORED' && error.message) return error.message;
    if (error.code === 'FORBIDDEN') return `You can't change the labels of ${projectName}.`;
    if (error.code === 'UNAUTHORIZED') return 'Your session ended. Sign in again to change labels.';
    if (error.code === 'NOT_FOUND')
      return 'This label no longer exists. Reload the page to see the current list.';
    if (error.status < 500 && error.message) return error.message;
  }
  return "Couldn't save the label. Check your connection and try again.";
}
