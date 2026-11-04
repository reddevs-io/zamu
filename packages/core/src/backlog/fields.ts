// M5: how Backlog.md values become native task fields (labels, due date, parent, blockers). Pure
// rules shared by the refresh planner; the backfill migration
// (packages/db/migrations/20261104110039_m5_backfill_mirrors) repeats them in SQL, so keep the two
// in step.
import { LABEL_COLOR_COUNT, MAX_LABEL_NAME_LENGTH } from '@pm/contracts';

/**
 * The due date a task gets from its block: the value when it is a real YYYY-MM-DD day (year 1 or
 * later, as Postgres dates need), else null. The parser already warns about unreadable values.
 */
export function backlogDueDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1) return null;
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? value
    : null;
}

/** Case-insensitive identity of a label name (Postgres lower() on the unique index). */
export function labelKey(name: string): string {
  return name.toLowerCase();
}

/**
 * The label names of a file: trimmed, empty ones dropped, one per name ignoring case (first
 * spelling kept). Names longer than MAX_LABEL_NAME_LENGTH characters can't be labels: they come
 * back in `tooLong` for a warning.
 */
export function backlogLabelNames(values: readonly string[]): { names: string[]; tooLong: string[] } {
  const names: string[] = [];
  const tooLong: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const name = value.trim();
    if (!name) continue;
    if ([...name].length > MAX_LABEL_NAME_LENGTH) {
      tooLong.push(name);
      continue;
    }
    const key = labelKey(name);
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return { names, tooLong };
}

/**
 * The hue for a new label: the one used by the fewest labels of the project, ties to the lowest
 * number. `counts[n]` is the number of labels with colour n (1 to LABEL_COLOR_COUNT).
 */
export function leastUsedLabelColor(counts: ReadonlyMap<number, number>): number {
  let best = 1;
  for (let color = 2; color <= LABEL_COLOR_COUNT; color++) {
    if ((counts.get(color) ?? 0) < (counts.get(best) ?? 0)) best = color;
  }
  return best;
}

/** Code point order (Postgres COLLATE "C"), for name orders the backfill repeats. */
export function compareCodePoints(left: string, right: string): number {
  const a = [...left];
  const b = [...right];
  for (let index = 0; index < Math.min(a.length, b.length); index++) {
    const x = (a[index] as string).codePointAt(0) as number;
    const y = (b[index] as string).codePointAt(0) as number;
    if (x !== y) return x - y;
  }
  return a.length - b.length;
}

/**
 * Warnings the planner computes from the whole read (not the parser's), so they are not carried
 * over for unchanged files: the next plan works them out again.
 */
export const FIELD_WARNING_PATTERN = /^(dependencies|labels|parent_task_id): /;
