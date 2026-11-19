// Mappings from Backlog.md values (statuses, priorities, assignees) to app values. Setup prefills
// them by name; a refresh looks values up and falls back (status Todo, priority none, no one) with a
// warning when a value has no row or its row is itself a fallback. Pure: no database, no I/O.
// Rules: M3 plan, section 5 "Field mapping".
import {
  type AssigneeMapping,
  type BacklogMappings,
  type BacklogMappingsView,
  type MappingHow,
  PRIORITIES,
  PRIORITY_LABELS,
  type Priority,
  type PriorityMapping,
  type StatusMapping,
  TASK_STATUS_LABELS,
  TASK_STATUSES,
  type TaskStatus,
  type UserRef,
} from '@zamu/contracts';

/** What a status without a mapping row becomes. */
export const FALLBACK_STATUS: TaskStatus = 'todo';
/** What a priority without a mapping row becomes. */
export const FALLBACK_PRIORITY: Priority = 'none';

/** Lowercase, without spaces, dashes and underscores; curly apostrophes become straight ones. */
export function normalizeName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[\s\-_]+/g, '');
}

/** The lookup key of a mapping row: rows match values ignoring case (BacklogMappings forbids duplicates that way). */
export function valueKey(value: string): string {
  return value.trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// Matching by name
// ---------------------------------------------------------------------------

const STATUS_NAMES = new Map<string, TaskStatus>();
for (const status of TASK_STATUSES) {
  STATUS_NAMES.set(normalizeName(status), status);
  STATUS_NAMES.set(normalizeName(TASK_STATUS_LABELS[status]), status);
}
STATUS_NAMES.set('cancelled', 'canceled');

/** Keyword rules after an exact name match fails, in order. */
const STATUS_KEYWORDS: [RegExp, TaskStatus][] = [
  [/review/, 'in_review'],
  [/progress|doing/, 'in_progress'],
  [/done|complete/, 'done'],
  [/cancel|won'?t/, 'canceled'],
  [/backlog|icebox/, 'backlog'],
];

/** The app status a Backlog.md status matches by name, or null. "To Do" is Todo, "Won't do" Canceled. */
export function matchStatusByName(value: string): TaskStatus | null {
  const name = normalizeName(value);
  const exact = STATUS_NAMES.get(name);
  if (exact) return exact;
  for (const [pattern, status] of STATUS_KEYWORDS) if (pattern.test(name)) return status;
  return null;
}

const PRIORITY_NAMES = new Map<string, Priority>();
for (const priority of PRIORITIES) {
  PRIORITY_NAMES.set(normalizeName(priority), priority);
  PRIORITY_NAMES.set(normalizeName(PRIORITY_LABELS[priority]), priority);
}

/** The app priority a Backlog.md priority matches by name (high, medium, low by default), or null. */
export function matchPriorityByName(value: string): Priority | null {
  return PRIORITY_NAMES.get(normalizeName(value)) ?? null;
}

/** A workspace member as assignee matching sees it. */
export interface MemberCandidate {
  id: string;
  name: string;
  kind: 'person' | 'agent';
  email: string;
}

/**
 * The member an assignee value names: `@name` or `name` against member names, agent names and email
 * local parts, ignoring case, spaces, dashes and underscores. Null when nobody or more than one
 * member matches.
 */
export function matchAssigneeByName(value: string, members: MemberCandidate[]): string | null {
  const name = normalizeName(value.replace(/^@+/, ''));
  if (!name) return null;
  const matches = new Set<string>();
  for (const member of members) {
    const local = member.email.split('@')[0] ?? '';
    if (normalizeName(member.name) === name || (local && normalizeName(local) === name)) {
      matches.add(member.id);
    }
  }
  return matches.size === 1 ? ([...matches][0] as string) : null;
}

// ---------------------------------------------------------------------------
// Values seen and prefilled mappings
// ---------------------------------------------------------------------------

/** How often each value occurs, keyed case-insensitively; the first spelling seen is kept. */
export class ValueCounter {
  readonly #entries = new Map<string, { value: string; count: number }>();

  /** Registers a value without counting a task (config statuses and priorities). */
  declare(value: string | null | undefined): void {
    this.#add(value, 0);
  }

  add(value: string | null | undefined): void {
    this.#add(value, 1);
  }

  #add(value: string | null | undefined, count: number): void {
    const text = value?.trim();
    if (!text) return;
    const key = valueKey(text);
    const entry = this.#entries.get(key);
    if (entry) entry.count += count;
    else this.#entries.set(key, { value: text.slice(0, 200), count });
  }

  count(value: string): number {
    return this.#entries.get(valueKey(value))?.count ?? 0;
  }

  entries(): { value: string; count: number }[] {
    return [...this.#entries.values()];
  }
}

/** Every status, priority and assignee value of a read, with the number of tasks carrying it. */
export interface SeenValues {
  status: ValueCounter;
  priority: ValueCounter;
  assignee: ValueCounter;
}

export function emptySeenValues(): SeenValues {
  return { status: new ValueCounter(), priority: new ValueCounter(), assignee: new ValueCounter() };
}

/**
 * Mappings prefilled by name for every value seen: matched values get `how: name`, the others the
 * fallback with `how: fallback`. Rows already in `current` are kept as they are (edit mode), and
 * values only in `current` stay too.
 */
export function prefillMappings(
  seen: SeenValues,
  members: MemberCandidate[],
  current: BacklogMappings = { status: [], priority: [], assignee: [] },
): BacklogMappings {
  const keep = <T extends { from: string }>(rows: T[]) =>
    new Map(rows.map((row) => [valueKey(row.from), row]));
  const currentStatus = keep(current.status);
  const currentPriority = keep(current.priority);
  const currentAssignee = keep(current.assignee);

  const status: StatusMapping[] = [];
  for (const { value } of seen.status.entries()) {
    const existing = currentStatus.get(valueKey(value));
    if (existing) {
      status.push(existing);
      continue;
    }
    const match = matchStatusByName(value);
    status.push({ from: value, to: match ?? FALLBACK_STATUS, how: match ? 'name' : 'fallback' });
  }
  const priority: PriorityMapping[] = [];
  for (const { value } of seen.priority.entries()) {
    const existing = currentPriority.get(valueKey(value));
    if (existing) {
      priority.push(existing);
      continue;
    }
    const match = matchPriorityByName(value);
    priority.push({ from: value, to: match ?? FALLBACK_PRIORITY, how: match ? 'name' : 'fallback' });
  }
  const assignee: AssigneeMapping[] = [];
  for (const { value } of seen.assignee.entries()) {
    const existing = currentAssignee.get(valueKey(value));
    if (existing) {
      assignee.push(existing);
      continue;
    }
    const userId = matchAssigneeByName(value, members);
    assignee.push({ from: value, userId, how: userId ? 'name' : 'fallback' });
  }

  // Rows for values no longer in the files stay, so an edit never loses a choice.
  const missing = <T extends { from: string }>(rows: T[], counter: ValueCounter) => {
    const seenKeys = new Set(counter.entries().map((entry) => valueKey(entry.value)));
    return rows.filter((row) => !seenKeys.has(valueKey(row.from)));
  };
  status.push(...missing(current.status, seen.status));
  priority.push(...missing(current.priority, seen.priority));
  assignee.push(...missing(current.assignee, seen.assignee));
  return { status, priority, assignee };
}

/** Mapping rows with task counts and resolved users, for detection, the settings page and status. */
export function mappingsView(
  mappings: BacklogMappings,
  seen: SeenValues,
  users: Map<string, UserRef>,
): BacklogMappingsView {
  const withSeen = <T extends { from: string }>(
    rows: T[],
    counter: ValueCounter,
    fallback: (value: string) => T,
  ) => {
    const keys = new Set(rows.map((row) => valueKey(row.from)));
    const extra = counter
      .entries()
      .filter((entry) => !keys.has(valueKey(entry.value)))
      .map((entry) => fallback(entry.value));
    return [...rows, ...extra].map((row) => ({ ...row, count: counter.count(row.from) }));
  };
  return {
    status: withSeen(mappings.status, seen.status, (from) => ({
      from,
      to: FALLBACK_STATUS,
      how: 'fallback' as MappingHow,
    })),
    priority: withSeen(mappings.priority, seen.priority, (from) => ({
      from,
      to: FALLBACK_PRIORITY,
      how: 'fallback' as MappingHow,
    })),
    assignee: withSeen(mappings.assignee, seen.assignee, (from) => ({
      from,
      userId: null as string | null,
      how: 'fallback' as MappingHow,
    })).map((row) => ({ ...row, user: row.userId ? (users.get(row.userId) ?? null) : null })),
  };
}

// ---------------------------------------------------------------------------
// Lookup during a refresh
// ---------------------------------------------------------------------------

/** A looked-up value: what the task gets, and whether that is a fallback worth a warning. */
export interface Mapped<T> {
  value: T;
  fellBack: boolean;
}

/** Mapping rows indexed for lookup. `members` limits assignees to current workspace members. */
export class MappingIndex {
  readonly #status: Map<string, StatusMapping>;
  readonly #priority: Map<string, PriorityMapping>;
  readonly #assignee: Map<string, AssigneeMapping>;
  readonly #members: Set<string> | null;

  constructor(mappings: BacklogMappings, members: Set<string> | null = null) {
    const index = <T extends { from: string }>(rows: T[]) =>
      new Map(rows.map((row) => [valueKey(row.from), row]));
    this.#status = index(mappings.status);
    this.#priority = index(mappings.priority);
    this.#assignee = index(mappings.assignee);
    this.#members = members;
  }

  status(value: string): Mapped<TaskStatus> {
    const row = this.#status.get(valueKey(value));
    if (!row) return { value: FALLBACK_STATUS, fellBack: true };
    return { value: row.to, fellBack: row.how === 'fallback' };
  }

  priority(value: string): Mapped<Priority> {
    const row = this.#priority.get(valueKey(value));
    if (!row) return { value: FALLBACK_PRIORITY, fellBack: true };
    return { value: row.to, fellBack: row.how === 'fallback' };
  }

  /** The member for an assignee value; null with fellBack when the value maps to no one by fallback. */
  assignee(value: string): Mapped<string | null> {
    const row = this.#assignee.get(valueKey(value));
    if (!row) return { value: null, fellBack: true };
    const userId = row.userId && (!this.#members || this.#members.has(row.userId)) ? row.userId : null;
    return { value: userId, fellBack: row.how === 'fallback' || (row.userId !== null && userId === null) };
  }
}
