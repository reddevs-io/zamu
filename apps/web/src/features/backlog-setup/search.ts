import { BACKLOG_MODES, type BacklogMode } from '@pm/contracts';

// Search params of the Backlog.md setup route, so a reload keeps the step:
//
//   /p/PAY/backlog-setup?mode=mirror                      Set up a mirror (project settings)
//   /p/PAY/backlog-setup?mode=import                      Import (project settings)
//   /p/PAY/backlog-setup?step=mappings&edit=1             Edit mappings (project settings)
//   /p/PAY/backlog-setup?mode=mirror&step=mappings&connection=<id>   New project from Backlog.md
//
// step, connection and folder are the setup's own state. Mappings picked by hand live in session
// storage (see mapping-memory.ts): they are too long for a URL.

export const SETUP_STEPS = ['mode', 'source', 'mappings', 'preview', 'read'] as const;
export type SetupStepId = (typeof SETUP_STEPS)[number];

export const SETUP_STEP_LABELS: Record<SetupStepId, string> = {
  mode: 'Mode',
  source: 'Source',
  mappings: 'Mappings',
  preview: 'Preview',
  read: 'Read',
};

export interface SetupSearch {
  /** Mirror unless set. */
  mode?: BacklogMode;
  /** Mode unless set. */
  step?: SetupStepId;
  /** Edit mode: only the mappings of an existing source, saved with updateMappings. */
  edit?: true;
  /** The git connection picked in Source. */
  connection?: string;
  /** Folder typed by hand in Source ("docs/backlog"); omitted: detected. */
  folder?: string;
}

function text(value: unknown, max: number): string | undefined {
  if (typeof value === 'number') return String(value);
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= max ? trimmed : undefined;
}

function flag(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true';
}

export function parseSetupSearch(search: Record<string, unknown>): SetupSearch {
  const mode = BACKLOG_MODES.find((item) => item === search.mode);
  const step = SETUP_STEPS.find((item) => item === search.step);
  const connection = text(search.connection, 64);
  const folder = text(search.folder, 200);
  return {
    ...(mode ? { mode } : {}),
    ...(step && step !== 'mode' ? { step } : {}),
    ...(flag(search.edit) ? { edit: true as const } : {}),
    ...(connection ? { connection } : {}),
    ...(folder ? { folder } : {}),
  };
}

/** Index of a step, 0 for Mode. */
export function stepIndex(step: SetupStepId): number {
  return SETUP_STEPS.indexOf(step);
}
