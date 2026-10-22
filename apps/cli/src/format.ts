// Human output: compact tables and short sentences. JSON output never goes through here.
import {
  type Activity,
  type ActivityChange,
  type AssigneeRef,
  type Me,
  PRIORITY_LABELS,
  type Priority,
  TASK_STATUS_LABELS,
  type TaskStatus,
  type UserRef,
} from '@pm/contracts';

export interface Style {
  bold: (text: string) => string;
  dim: (text: string) => string;
  status: (status: TaskStatus, text: string) => string;
  priority: (priority: Priority, text: string) => string;
}

const sgr = (open: number, close: number) => (text: string) => `\u001b[${open}m${text}\u001b[${close}m`;
const plain = (text: string) => text;

const STATUS_COLOR: Record<TaskStatus, ((text: string) => string) | null> = {
  backlog: sgr(2, 22),
  todo: null,
  in_progress: sgr(33, 39),
  in_review: sgr(35, 39),
  done: sgr(32, 39),
  canceled: sgr(2, 22),
};

const PRIORITY_COLOR: Record<Priority, ((text: string) => string) | null> = {
  none: sgr(2, 22),
  low: null,
  medium: null,
  high: sgr(33, 39),
  urgent: sgr(31, 39),
};

export function createStyle(color: boolean): Style {
  if (!color) return { bold: plain, dim: plain, status: (_s, t) => t, priority: (_p, t) => t };
  return {
    bold: sgr(1, 22),
    dim: sgr(2, 22),
    status: (status, text) => STATUS_COLOR[status]?.(text) ?? text,
    priority: (priority, text) => PRIORITY_COLOR[priority]?.(text) ?? text,
  };
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: matches ANSI escape sequences
const ANSI = /\u001b\[[0-9;]*m/g;

/** Visible width of a cell (ANSI codes do not count). */
function width(text: string): number {
  return [...text.replace(ANSI, '')].length;
}

function truncate(text: string, max: number): string {
  const chars = [...text];
  if (chars.length <= max) return text;
  return max <= 1 ? chars.slice(0, max).join('') : `${chars.slice(0, max - 1).join('')}…`;
}

export interface Column<Row> {
  header: string;
  value: (row: Row) => string;
  /** Styles the padded cell; the value itself stays plain so widths line up. */
  style?: (row: Row, cell: string) => string;
}

/**
 * Left-aligned columns separated by two spaces. The last column is not padded and, on a terminal,
 * is cut to fit the width.
 */
export function table<Row>(rows: Row[], columns: Column<Row>[], style: Style, maxWidth?: number): string {
  const cells = rows.map((row) => columns.map((column) => column.value(row)));
  const widths = columns.map((column, i) =>
    Math.max(width(column.header), ...cells.map((row) => width(row[i] ?? ''))),
  );
  const lead = widths.slice(0, -1).reduce((sum, w) => sum + w + 2, 0);
  const lastMax = maxWidth ? Math.max(maxWidth - lead, 10) : undefined;
  const fit = (text: string, i: number) => {
    const isLast = i === columns.length - 1;
    if (isLast) return lastMax ? truncate(text, lastMax) : text;
    return text + ' '.repeat((widths[i] ?? 0) - width(text));
  };
  const header = columns.map((column, i) => fit(column.header, i)).join('  ');
  const lines = [style.dim(header.trimEnd())];
  rows.forEach((row, r) => {
    const line = columns
      .map((column, i) => {
        const cell = fit(cells[r]?.[i] ?? '', i);
        return column.style ? column.style(row, cell) : cell;
      })
      .join('  ');
    lines.push(line.trimEnd());
  });
  return `${lines.join('\n')}\n`;
}

/** Label/value lines with aligned values. */
export function fields(entries: [string, string][], style: Style): string {
  const labelWidth = Math.max(...entries.map(([label]) => width(label)));
  return `${entries.map(([label, value]) => `${style.dim(label.padEnd(labelWidth))}  ${value}`).join('\n')}\n`;
}

export const statusLabel = (status: TaskStatus) => TASK_STATUS_LABELS[status];
export const priorityLabel = (priority: Priority) => PRIORITY_LABELS[priority];

/** "claude-dev for Ana Ruiz" for agents with a responsible human, the name otherwise. */
export function personLabel(user: Pick<AssigneeRef, 'name'> & { responsible?: UserRef | null }): string {
  return user.responsible ? `${user.name} for ${user.responsible.name}` : user.name;
}

export function assigneeLabel(assignee: AssigneeRef | null): string {
  return assignee ? personLabel(assignee) : 'Unassigned';
}

/** `2026-10-22 18:19` in UTC: stable across machines, which matters for agents and logs. */
export function formatTime(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}

export function formatDate(iso: string): string {
  return iso.slice(0, 10);
}

function quote(text: string | null): string {
  return text === null ? 'nothing' : `"${text}"`;
}

/** One change as the activity feed phrases it: "moved it from Todo to In progress". */
export function changeSentence(change: ActivityChange): string {
  switch (change.field) {
    case 'status':
      if (change.from === null) return `set the status to ${change.to ? statusLabel(change.to) : 'none'}`;
      return `moved it from ${statusLabel(change.from)} to ${change.to ? statusLabel(change.to) : 'none'}`;
    case 'priority':
      if (change.from === null) return `set the priority to ${change.to ? priorityLabel(change.to) : 'none'}`;
      return `changed the priority from ${priorityLabel(change.from)} to ${change.to ? priorityLabel(change.to) : 'none'}`;
    case 'assignee':
      if (change.to === null) return change.from ? `unassigned ${change.from.name}` : 'unassigned it';
      if (change.from === null) return `assigned it to ${change.to.name}`;
      return `reassigned it from ${change.from.name} to ${change.to.name}`;
    case 'title':
      return change.from === null
        ? `set the title to ${quote(change.to)}`
        : `renamed it to ${quote(change.to)}`;
    case 'description':
      if (change.to === null) return 'cleared the description';
      return change.from === null ? 'added a description' : 'edited the description';
  }
}

/** "claude-dev for Ana Ruiz moved it from Todo to In progress". */
export function activitySentence(activity: Activity): string {
  const who = activity.onBehalfOf
    ? `${activity.actor.name} for ${activity.onBehalfOf.name}`
    : activity.actor.name;
  if (activity.type === 'task.created') {
    // The title and description are on screen already; the rest are values that differ from defaults.
    const extras = activity.changes
      .filter((change) => change.field !== 'title' && change.field !== 'description')
      .map(changeSentence);
    return [`${who} created the task`, ...extras].join(', ');
  }
  const changes = activity.changes.map(changeSentence);
  return `${who} ${changes.length ? changes.join(', ') : 'updated the task'}`;
}

/** "all projects, write" or "PAY, WEB, read". */
export function scopeLabel(scope: NonNullable<Me['auth']['scope']>): string {
  const projects = scope.projects === 'all' ? 'all projects' : scope.projects.map((p) => p.key).join(', ');
  return `${projects}, ${scope.access}`;
}
