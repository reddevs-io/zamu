import type { BacklogSourceStatus } from '@pm/contracts';

// Where a source's first read stands. Shared by the Read step, the polling query and the step list.

/** States in which the first read is still running. */
export const READING_STATES = new Set<BacklogSourceStatus['state']>(['setup', 'reading']);

export type ReadPhase = 'reading' | 'done' | 'failed' | 'paused' | 'detached';

/** Where the first read stands, from the source's state and mode. */
export function readPhase(status: Pick<BacklogSourceStatus, 'state' | 'mode' | 'lastRead'>): ReadPhase {
  if (READING_STATES.has(status.state)) return 'reading';
  if (status.state === 'failed') return 'failed';
  if (status.state === 'paused') return 'paused';
  if (status.state === 'detached') return status.mode === 'import' && status.lastRead ? 'done' : 'detached';
  return 'done';
}

/** Every task the read created: tasks/, drafts and archived ones. */
export function readTotal(status: Pick<BacklogSourceStatus, 'counts'>): number {
  const { tasks, drafts, archived } = status.counts;
  return tasks + drafts + archived;
}
