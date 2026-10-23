// Human output: compact tables and short sentences. JSON output never goes through here.
import {
  type Activity,
  type ActivityChange,
  type AssigneeRef,
  type Comment,
  CYCLE_STATE_LABELS,
  type CycleState,
  type Me,
  MILESTONE_STATUS_LABELS,
  type MilestoneStatus,
  PRIORITY_LABELS,
  type Priority,
  TASK_STATUS_LABELS,
  type TaskStatus,
  type TimelineItem,
  type UserRef,
} from '@pm/contracts';

export interface Style {
  bold: (text: string) => string;
  dim: (text: string) => string;
  status: (status: TaskStatus, text: string) => string;
  priority: (priority: Priority, text: string) => string;
  /** Needs attention: overdue, stalled, ending soon. */
  warn: (text: string) => string;
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
  if (!color) return { bold: plain, dim: plain, status: (_s, t) => t, priority: (_p, t) => t, warn: plain };
  return {
    bold: sgr(1, 22),
    dim: sgr(2, 22),
    warn: sgr(33, 39),
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

export interface GridColumn<Row> extends Column<Row> {
  /** Gives up width so the line fits the terminal (one column per grid). */
  flex?: boolean;
}

export interface GridOptions {
  /** Prints the dim header line (default true). */
  header?: boolean;
  /** Prefix of every line, e.g. two spaces under a section heading. */
  indent?: string;
  maxWidth?: number;
}

/**
 * Like table(), but the column marked flex (a title or an excerpt, anywhere in the row) is the one
 * cut to fit the terminal width, so the columns after it stay visible.
 */
export function grid<Row>(
  rows: Row[],
  columns: GridColumn<Row>[],
  style: Style,
  { header = true, indent = '', maxWidth }: GridOptions = {},
): string {
  const cells = rows.map((row) => columns.map((column) => column.value(row)));
  const widths = columns.map((column, i) =>
    Math.max(header ? width(column.header) : 0, ...cells.map((row) => width(row[i] ?? ''))),
  );
  const flex = columns.findIndex((column) => column.flex);
  if (maxWidth && flex !== -1) {
    const total = width(indent) + widths.reduce((sum, w) => sum + w, 0) + 2 * (columns.length - 1);
    if (total > maxWidth) widths[flex] = Math.max((widths[flex] ?? 0) - (total - maxWidth), 10);
  }
  const fit = (text: string, i: number) => {
    const cut = i === flex ? truncate(text, widths[i] ?? 0) : text;
    return i === columns.length - 1 ? cut : cut + ' '.repeat(Math.max((widths[i] ?? 0) - width(cut), 0));
  };
  const lines: string[] = [];
  if (header)
    lines.push(
      indent +
        style.dim(
          columns
            .map((column, i) => fit(column.header, i))
            .join('  ')
            .trimEnd(),
        ),
    );
  rows.forEach((row, r) => {
    const line = columns
      .map((column, i) => {
        const cell = fit(cells[r]?.[i] ?? '', i);
        return column.style ? column.style(row, cell) : cell;
      })
      .join('  ');
    lines.push(indent + line.trimEnd());
  });
  return lines.length ? `${lines.join('\n')}\n` : '';
}

/**
 * Compact time between two instants, for "in review 3h" or "no update 26h": minutes under an
 * hour, hours under two days, days after that.
 */
export function elapsed(from: string, to: string): string {
  const minutes = Math.max(Math.floor((Date.parse(to) - Date.parse(from)) / 60_000), 0);
  if (minutes < 1) return '<1m';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
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
    case 'milestone':
      return change.to ? `set milestone ${change.to.name}` : 'cleared the milestone';
    case 'cycle':
      if (change.to) return `moved it to Cycle ${change.to.number}`;
      return change.from ? `removed it from Cycle ${change.from.number}` : 'removed it from the cycle';
  }
}

/** "claude-dev for Ana Ruiz moved it from Todo to In progress". */
export function activitySentence(activity: Activity): string {
  // A null actor is the system: the hourly job that ends cycles.
  const actor = activity.actor?.name ?? 'System';
  const who = activity.onBehalfOf ? `${actor} for ${activity.onBehalfOf.name}` : actor;
  if (activity.type === 'cycle.ended') {
    // "Cycle 12 ended. Moved to Cycle 13." The hourly job has no actor; a person who ended it early does.
    const change = activity.changes.find((c) => c.field === 'cycle');
    const ended = change?.from ? `Cycle ${change.from.number}` : 'the cycle';
    const moved = change?.to ? `Moved to Cycle ${change.to.number}.` : 'Removed from the cycle.';
    return activity.actor
      ? `${who} ended ${ended}. ${moved}`
      : `${ended.charAt(0).toUpperCase()}${ended.slice(1)} ended. ${moved}`;
  }
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

export const milestoneStatusLabel = (status: MilestoneStatus) => MILESTONE_STATUS_LABELS[status];
export const cycleStateLabel = (state: CycleState) => CYCLE_STATE_LABELS[state];

/** "Cycle 12" or "Cycle 12 · Checkout rewrite". */
export function cycleLabel(cycle: { number: number; name: string | null }): string {
  return cycle.name ? `Cycle ${cycle.number} · ${cycle.name}` : `Cycle ${cycle.number}`;
}

/** "2026-10-12 to 2026-10-25" (both days included). */
export function cycleDates(cycle: { startsOn: string; endsOn: string }): string {
  return `${cycle.startsOn} to ${cycle.endsOn}`;
}

/** Done share of the non-canceled tasks: "3/5 · 60%". */
export function progressLabel(progress: { total: number; done: number; canceled: number }): string {
  const counted = progress.total - progress.canceled;
  const percent = counted > 0 ? Math.round((progress.done / counted) * 100) : 0;
  return `${progress.done}/${counted} · ${percent}%`;
}

/** Mention links ([@Ana Ruiz](mention:<id>)) read as plain @Ana Ruiz in a terminal. */
export function plainMentions(body: string): string {
  return body.replace(/\[@([^\]]+)\]\(mention:[^)\s]+\)/g, '@$1');
}

/** "claude-dev for Ana Ruiz" for an agent's comment, the author's name otherwise. */
export function commentAuthor(comment: Pick<Comment, 'author' | 'onBehalfOf'>): string {
  return comment.onBehalfOf ? `${comment.author.name} for ${comment.onBehalfOf.name}` : comment.author.name;
}

const COMMENT_INDENT = '    ';

/**
 * A comment as a block: a heading line with time, author and id, then the body indented. Deleted
 * comments keep their place as one line.
 */
export function commentBlock(comment: Comment, style: Style): string {
  const time = style.dim(formatTime(comment.createdAt));
  if (comment.body === null) {
    return `${time}  ${style.dim(`Comment deleted by ${commentAuthor(comment)}`)}`;
  }
  const edited = comment.editedAt ? ' (edited)' : '';
  const head = `${time}  ${style.bold(commentAuthor(comment))} commented${edited}  ${style.dim(comment.id)}`;
  const body = plainMentions(comment.body)
    .replace(/\s+$/, '')
    .split('\n')
    .map((line) => (line.trim() ? `${COMMENT_INDENT}${line}` : ''))
    .join('\n');
  return `${head}\n${body}`;
}

/** Activity as one line each, comments as indented blocks set off by blank lines, oldest first. */
export function timelineText(items: TimelineItem[], style: Style): string {
  const lines: string[] = [];
  let afterBlock = false;
  for (const item of items) {
    const isBlock = item.kind === 'comment' && item.body !== null;
    if (lines.length && (isBlock || afterBlock)) lines.push('');
    lines.push(
      item.kind === 'comment'
        ? commentBlock(item, style)
        : `${style.dim(formatTime(item.createdAt))}  ${activitySentence(item)}`,
    );
    afterBlock = isBlock;
  }
  return lines.length ? `${lines.join('\n')}\n` : '';
}
