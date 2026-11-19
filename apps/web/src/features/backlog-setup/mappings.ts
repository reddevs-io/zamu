import type { BacklogMappings, BacklogMappingsView, Priority, TaskStatus } from '@zamu/contracts';

// The three mapping tables of the setup (step 3) and of Edit mappings. Rows come from detection (or
// the source's status in edit mode) with their task counts; a pick by hand turns the row's `how`
// into manual. What the server receives is the plain BacklogMappings.

export type MappingKind = keyof BacklogMappings;

/** The "No one" option of the assignee select. */
export const NO_ONE = 'none';

/** The "Create agent…" option of an unmatched assignee select. Picking it opens Add agent. */
export const CREATE_AGENT = 'create-agent';

/** Drops counts and resolved users: the input shape of preview, start and updateMappings. */
export function toMappings(view: BacklogMappingsView): BacklogMappings {
  return {
    status: view.status.map(({ from, to, how }) => ({ from, to, how })),
    priority: view.priority.map(({ from, to, how }) => ({ from, to, how })),
    assignee: view.assignee.map(({ from, userId, how }) => ({ from, userId, how })),
  };
}

/** Number of rows in the three tables ("13 values" in the step list). */
export function mappingValueCount(view: Pick<BacklogMappingsView, MappingKind>): number {
  return view.status.length + view.priority.length + view.assignee.length;
}

export function setStatus(view: BacklogMappingsView, from: string, to: TaskStatus): BacklogMappingsView {
  return {
    ...view,
    status: view.status.map((row) => (row.from === from ? { ...row, to, how: 'manual' } : row)),
  };
}

export function setPriority(view: BacklogMappingsView, from: string, to: Priority): BacklogMappingsView {
  return {
    ...view,
    priority: view.priority.map((row) => (row.from === from ? { ...row, to, how: 'manual' } : row)),
  };
}

/** The select lists members, so the resolved `user` is not needed after a pick by hand. */
export function setAssignee(
  view: BacklogMappingsView,
  from: string,
  userId: string | null,
): BacklogMappingsView {
  return {
    ...view,
    assignee: view.assignee.map((row) =>
      row.from === from ? { ...row, userId, user: null, how: 'manual' } : row,
    ),
  };
}

const sameValue = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * Puts picks made by hand (kept in session storage across reloads) back onto freshly detected rows.
 * Only manual rows are carried over, and only for values the files still contain.
 */
export function applyManualPicks(
  view: BacklogMappingsView,
  saved: BacklogMappings | null,
): BacklogMappingsView {
  if (!saved) return view;
  const pick = <R extends { from: string; how: string }>(rows: readonly R[], from: string) =>
    rows.find((row) => row.how === 'manual' && sameValue(row.from, from));
  return {
    status: view.status.map((row) => {
      const manual = pick(saved.status, row.from);
      return manual ? { ...row, to: manual.to, how: 'manual' } : row;
    }),
    priority: view.priority.map((row) => {
      const manual = pick(saved.priority, row.from);
      return manual ? { ...row, to: manual.to, how: 'manual' } : row;
    }),
    assignee: view.assignee.map((row) => {
      const manual = pick(saved.assignee, row.from);
      if (!manual) return row;
      return {
        ...row,
        userId: manual.userId,
        user: manual.userId === row.userId ? row.user : null,
        how: 'manual',
      };
    }),
  };
}
