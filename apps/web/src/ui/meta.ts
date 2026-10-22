/**
 * Display metadata for task statuses and priorities. Values match the M1 data model:
 * statuses backlog, todo, in_progress, in_review, done, canceled; priorities 0 (none) to 4 (urgent).
 */

export const TASK_STATUSES = ['backlog', 'todo', 'in_progress', 'in_review', 'done', 'canceled'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const STATUS_LABELS: Record<TaskStatus, string> = {
  backlog: 'Backlog',
  todo: 'Todo',
  in_progress: 'In progress',
  in_review: 'In review',
  done: 'Done',
  canceled: 'Canceled',
};

/** Statuses that count as open work (shown in StatusBar and open counts). */
export const OPEN_STATUSES: readonly TaskStatus[] = ['in_progress', 'in_review', 'todo', 'backlog'];

export const PRIORITIES = ['none', 'low', 'medium', 'high', 'urgent'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const PRIORITY_LABELS: Record<Priority, string> = {
  none: 'None',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
};

/** Accepts the API's 0 to 4 number or the name. */
export function toPriority(value: Priority | number): Priority {
  if (typeof value === 'string') return value;
  return PRIORITIES[Math.max(0, Math.min(4, Math.round(value)))] ?? 'none';
}

const HUES = [25, 60, 145, 190, 220, 262, 300, 340];

/** Stable avatar hue (oklch hue angle) derived from a name. */
export function hueFromName(name: string): number {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  return HUES[hash % HUES.length] ?? 25;
}

/** "Ana Ruiz" → "AR", "claude-dev" → "C" for agents. */
export function initialsFor(name: string, kind: 'person' | 'agent'): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  if (kind === 'agent') return trimmed.charAt(0).toUpperCase();
  const words = trimmed.split(/\s+/).filter(Boolean);
  const first = words[0]?.charAt(0) ?? '';
  const last = words.length > 1 ? (words[words.length - 1]?.charAt(0) ?? '') : '';
  return (first + last).toUpperCase() || '?';
}
