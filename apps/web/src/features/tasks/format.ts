import type { Activity, ActivityChange, Priority, TaskStatus } from '@pm/contracts';
import { PRIORITY_LABELS, STATUS_LABELS } from '~/ui';

// Display helpers for the task screens: short times, activity sentences and Markdown checkbox lists.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function toDate(value: string | Date): Date {
  return typeof value === 'string' ? new Date(value) : value;
}

/** "Oct 20", with the year when it is not the current one: "Oct 20, 2025". */
export function formatDay(value: string | Date, now: Date = new Date()): string {
  const date = toDate(value);
  const day = `${MONTHS[date.getMonth()]} ${date.getDate()}`;
  return date.getFullYear() === now.getFullYear() ? day : `${day}, ${date.getFullYear()}`;
}

/** "Oct 21, 16:02". */
export function formatDayTime(value: string | Date, now: Date = new Date()): string {
  const date = toDate(value);
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  return `${formatDay(date, now)}, ${time}`;
}

/** Compact age for the list's Upd column: "now", "3m", "1h", "2d", then "Oct 20". */
export function formatAge(value: string | Date, now: Date = new Date()): string {
  const elapsed = Math.max(0, now.getTime() - toDate(value).getTime());
  if (elapsed < MINUTE) return 'now';
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h`;
  if (elapsed < 7 * DAY) return `${Math.floor(elapsed / DAY)}d`;
  return formatDay(value, now);
}

/** Detail pane timeline: "40m" or "3h" within a day, then "Oct 20". */
export function formatPaneTime(value: string | Date, now: Date = new Date()): string {
  const elapsed = Math.max(0, now.getTime() - toDate(value).getTime());
  if (elapsed < DAY) return formatAge(value, now);
  return formatDay(value, now);
}

/** Task page: "5h ago" within a day, then "Oct 21, 16:02". */
export function formatPageTime(value: string | Date, now: Date = new Date()): string {
  const elapsed = Math.max(0, now.getTime() - toDate(value).getTime());
  if (elapsed < MINUTE) return 'just now';
  if (elapsed < DAY) return `${formatAge(value, now)} ago`;
  return formatDayTime(value, now);
}

/** Splits a CalendarDate ("2026-11-14") into a local Date at midnight, so the day never shifts by zone. */
function calendarDate(value: string): Date {
  const [year = 1970, month = 1, day = 1] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** A CalendarDate as "Nov 14", with the year when it is not the current one. */
export function formatCalendarDay(value: string, now: Date = new Date()): string {
  return formatDay(calendarDate(value), now);
}

/** "Oct 26 – Nov 8". */
export function formatDateRange(start: string, end: string, now: Date = new Date()): string {
  return `${formatCalendarDay(start, now)} – ${formatCalendarDay(end, now)}`;
}

/**
 * Binds a formatter to the clock from useNow(). Before the clock is set (SSR, hydration) it returns '',
 * so server and browser render the same markup.
 */
export function atTime(
  format: (value: string | Date, now: Date) => string,
  now: number | null,
): (value: string | Date) => string {
  if (now == null) return () => '';
  const date = new Date(now);
  return (value) => format(value, date);
}

// ---------------------------------------------------------------------------
// Markdown task lists
// ---------------------------------------------------------------------------

/** Matches a GFM task list item: indentation, bullet, space, [ ] or [x]. */
const CHECKBOX_LINE = /^(\s*(?:[-*+]|\d+[.)])\s+)\[([ xX])\]/;

export interface CheckboxItem {
  /** Line index in the source. */
  line: number;
  checked: boolean;
}

/** Every task list checkbox in a Markdown source, in order. Fenced code blocks are skipped. */
export function findCheckboxes(source: string | null | undefined): CheckboxItem[] {
  if (!source) return [];
  const items: CheckboxItem[] = [];
  let fence: string | null = null;
  source.split('\n').forEach((text, line) => {
    const marker = /^\s*(`{3,}|~{3,})/.exec(text)?.[1];
    if (marker) {
      if (fence === null) fence = marker[0] ?? null;
      else if (marker[0] === fence) fence = null;
      return;
    }
    if (fence !== null) return;
    const match = CHECKBOX_LINE.exec(text);
    if (match) items.push({ line, checked: match[2] !== ' ' });
  });
  return items;
}

/** Flips the nth checkbox (0-based, in document order). Returns the source unchanged when out of range. */
export function toggleCheckbox(source: string, index: number): string {
  const item = findCheckboxes(source)[index];
  if (!item) return source;
  const lines = source.split('\n');
  const text = lines[item.line] ?? '';
  lines[item.line] = text.replace(
    CHECKBOX_LINE,
    (_all, lead: string) => `${lead}[${item.checked ? ' ' : 'x'}]`,
  );
  return lines.join('\n');
}

/**
 * When a description change only ticks or unticks checkboxes, describes it: "checked off 2 items",
 * "unchecked 1 item". Returns null for any other edit.
 */
export function describeCheckboxChange(from: string | null, to: string | null): string | null {
  if (from == null || to == null) return null;
  const strip = (value: string) => value.replace(/^(\s*(?:[-*+]|\d+[.)])\s+)\[[ xX]\]/gm, '$1[]');
  if (strip(from) !== strip(to)) return null;
  const before = findCheckboxes(from);
  const after = findCheckboxes(to);
  let checked = 0;
  let unchecked = 0;
  after.forEach((item, index) => {
    const previous = before[index];
    if (!previous || previous.checked === item.checked) return;
    if (item.checked) checked++;
    else unchecked++;
  });
  const items = (count: number) => `${count} ${count === 1 ? 'item' : 'items'}`;
  const parts: string[] = [];
  if (checked) parts.push(`checked off ${items(checked)}`);
  if (unchecked) parts.push(`unchecked ${items(unchecked)}`);
  return parts.length ? parts.join(' and ') : null;
}

// ---------------------------------------------------------------------------
// Activity sentences
// ---------------------------------------------------------------------------

const statusLabel = (status: TaskStatus | null) => (status ? STATUS_LABELS[status] : 'none');
const priorityLabel = (priority: Priority | null) => (priority ? PRIORITY_LABELS[priority] : 'None');

function describeChange(change: ActivityChange): string {
  switch (change.field) {
    case 'status':
      return change.from
        ? `moved it from ${statusLabel(change.from)} to ${statusLabel(change.to)}`
        : `set status to ${statusLabel(change.to)}`;
    case 'priority':
      return `set priority to ${priorityLabel(change.to)}`;
    case 'assignee':
      return change.to ? `assigned it to ${change.to.name}` : 'unassigned it';
    case 'title':
      return `renamed it to “${change.to ?? ''}”`;
    case 'description': {
      const checks = describeCheckboxChange(change.from, change.to);
      if (checks) return checks;
      if (!change.to) return 'cleared the description';
      if (!change.from) return 'added a description';
      return 'edited the description';
    }
    case 'milestone':
      return change.to ? `set milestone ${change.to.name}` : 'cleared the milestone';
    case 'cycle':
      if (change.to) return `moved it to Cycle ${change.to.number}`;
      return change.from ? `removed it from Cycle ${change.from.number}` : 'removed it from the cycle';
  }
}

function joinPhrases(phrases: string[]): string {
  if (phrases.length <= 1) return phrases[0] ?? '';
  return `${phrases.slice(0, -1).join(', ')} and ${phrases.at(-1)}`;
}

const cycleName = (cycle: { number: number }) => `Cycle ${cycle.number}`;

/** The verb phrase after the actor: "moved it from Todo to In progress", "created the task". */
export function describeActivity(activity: Pick<Activity, 'type' | 'changes'>): string {
  if (activity.type === 'task.created') return 'created the task';
  if (activity.type === 'cycle.ended') {
    const change = activity.changes.find((item) => item.field === 'cycle');
    if (change?.field === 'cycle' && change.from) {
      return change.to
        ? `ended ${cycleName(change.from)} and moved it to ${cycleName(change.to)}`
        : `ended ${cycleName(change.from)} and took it out of the cycle`;
    }
  }
  return joinPhrases(activity.changes.map(describeChange)) || 'updated the task';
}

/**
 * The system line for a cycle.ended entry: "Cycle 12 ended. Moved to Cycle 13." The person who ended
 * a cycle early, if any, is named by the caller.
 */
export function describeCycleEnded(activity: Pick<Activity, 'changes'>): string {
  const change = activity.changes.find((item) => item.field === 'cycle');
  if (change?.field !== 'cycle' || !change.from) return 'The cycle ended.';
  const ended = `${cycleName(change.from)} ended.`;
  return change.to ? `${ended} Moved to ${cycleName(change.to)}.` : `${ended} Taken out of the cycle.`;
}
