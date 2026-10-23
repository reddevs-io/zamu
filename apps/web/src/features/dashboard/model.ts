import type {
  AssigneeRef,
  Dashboard,
  DashboardAgent,
  DashboardScope,
  DeadlineItem,
  Member,
  MentionItem,
  ReviewItem,
  StalledItem,
} from '@pm/contracts';
import type { QueueGroupKind } from '~/ui';
import type { QueueGroupId } from './search';

// What the dashboard screen shows, as plain data: queue rows per group, the rows a refresh removed but
// focus still holds, search matching, and the short texts ("in review 3h", "ends tomorrow").

/** Rows a group shows before Show all. */
export const COLLAPSED_ROWS = 5;
/** Project rows before "Show all". */
export const PROJECT_ROWS = 12;

export interface QueueGroupMeta {
  id: QueueGroupId;
  kind: QueueGroupKind;
  label: string;
  emptyText: string;
  /** 1 to 4. */
  hotkey: string;
}

export const GROUPS: readonly QueueGroupMeta[] = [
  { id: 'review', kind: 'review', label: 'In review', emptyText: 'Nothing waiting for review', hotkey: '1' },
  { id: 'mentions', kind: 'mention', label: 'Mentions', emptyText: 'No open questions', hotkey: '2' },
  { id: 'stalled', kind: 'stalled', label: 'Stalled', emptyText: 'Nothing stalled', hotkey: '3' },
  {
    id: 'deadlines',
    kind: 'deadline',
    label: 'Deadlines',
    emptyText: 'No deadlines in the next 2 days',
    hotkey: '4',
  },
];

/** One queue item and the group it sits in. */
export type QueueSource =
  | { group: 'review'; item: ReviewItem }
  | { group: 'mentions'; item: MentionItem }
  | { group: 'stalled'; item: StalledItem }
  | { group: 'deadlines'; item: DeadlineItem };

export type QueueEntry = QueueSource & {
  /** Unique across the queue: a task can sit in two groups. */
  id: string;
  /** Gone from the latest answer; kept in place while focus or the panel holds it. */
  gone?: boolean;
};

export function entryId(entry: QueueSource): string {
  switch (entry.group) {
    case 'review':
      return `review:${entry.item.task.key}`;
    case 'mentions':
      return `mentions:${entry.item.task.key}:${entry.item.mentioned.id}`;
    case 'stalled':
      return `stalled:${entry.item.task.key}`;
    case 'deadlines':
      return entry.item.kind === 'milestone'
        ? `deadlines:milestone:${entry.item.milestone.id}`
        : `deadlines:cycle:${entry.item.project.key}:${entry.item.cycle.number}`;
  }
}

/** Every item the answer carries for a group (up to 50), in server order. */
export function groupEntries(dashboard: Dashboard, group: QueueGroupId): QueueEntry[] {
  const make = (source: QueueSource): QueueEntry => ({ ...source, id: entryId(source) });
  switch (group) {
    case 'review':
      return dashboard.groups.review.items.map((item) => make({ group, item }));
    case 'mentions':
      return dashboard.groups.mentions.items.map((item) => make({ group, item }));
    case 'stalled':
      return dashboard.groups.stalled.items.map((item) => make({ group, item }));
    case 'deadlines':
      return dashboard.groups.deadlines.items.map((item) => make({ group, item }));
  }
}

/** The task a row opens in the panel; null for deadline rows. */
export function taskKeyOf(entry: QueueEntry): string | null {
  return entry.group === 'deadlines' ? null : entry.item.task.key;
}

/** Case-insensitive match on keys, titles, names and the mention excerpt. */
export function entryMatches(entry: QueueEntry, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const fields: (string | null | undefined)[] = [];
  if (entry.group === 'deadlines') {
    const item = entry.item;
    fields.push(item.project.key, item.project.name);
    if (item.kind === 'milestone') fields.push(item.milestone.name);
    else fields.push(`Cycle ${item.cycle.number}`, item.cycle.name);
  } else {
    const { task } = entry.item;
    fields.push(task.key, task.title, task.project.name);
    if (entry.group === 'mentions') {
      fields.push(entry.item.author.name, entry.item.mentioned.name, entry.item.comment.excerpt);
    } else {
      fields.push(entry.item.assignee?.name);
    }
  }
  return fields.some((field) => field?.toLowerCase().includes(needle));
}

/**
 * Keeps rows a refresh removed while focus or the panel is on them: each held row that the new list lacks
 * goes back at the place it had, marked gone. Once nothing holds it, the next call drops it.
 */
export function keepHeldRows(
  previous: readonly QueueEntry[],
  next: readonly QueueEntry[],
  held: ReadonlySet<string>,
  /** Ids the answer still has but `next` leaves out (the 5-row cap, a search): never kept. */
  present: ReadonlySet<string> = new Set(),
): QueueEntry[] {
  if (!held.size) return [...next];
  const nextIds = new Set(next.map((entry) => entry.id));
  const result = [...next];
  previous.forEach((entry, index) => {
    if (!held.has(entry.id) || nextIds.has(entry.id) || present.has(entry.id)) return;
    result.splice(Math.min(index, result.length), 0, { ...entry, gone: true });
  });
  return result;
}

// ---------------------------------------------------------------------------
// Short texts
// ---------------------------------------------------------------------------

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const elapsed = (iso: string, now: number) => Math.max(0, now - new Date(iso).getTime());

/** "40m", "3h", "1d": how long a task has been in review. */
export function waitAge(iso: string, now: number): string {
  const ms = elapsed(iso, now);
  if (ms < HOUR) return `${Math.max(1, Math.floor(ms / MINUTE))}m`;
  if (ms < DAY) return `${Math.floor(ms / HOUR)}h`;
  return `${Math.floor(ms / DAY)}d`;
}

/** "26h", "31h", then "6d" from two days: how long a task has been silent. */
export function silenceAge(iso: string, now: number): string {
  const ms = elapsed(iso, now);
  if (ms < HOUR) return `${Math.max(1, Math.floor(ms / MINUTE))}m`;
  if (ms < 2 * DAY) return `${Math.floor(ms / HOUR)}h`;
  return `${Math.floor(ms / DAY)}d`;
}

/** "now", "25m", "2h", "3d": when a mention was written. */
export function shortAgo(iso: string, now: number): string {
  const ms = elapsed(iso, now);
  if (ms < MINUTE) return 'now';
  if (ms < HOUR) return `${Math.floor(ms / MINUTE)}m`;
  if (ms < DAY) return `${Math.floor(ms / HOUR)}h`;
  return `${Math.floor(ms / DAY)}d`;
}

/** "just now", "40m ago", "3h ago", "yesterday", "3d ago". */
export function sinceText(iso: string, now: number): string {
  const ms = elapsed(iso, now);
  if (ms < MINUTE) return 'just now';
  if (ms < HOUR) return `${Math.floor(ms / MINUTE)}m ago`;
  if (ms < DAY) return `${Math.floor(ms / HOUR)}h ago`;
  if (ms < 2 * DAY) return 'yesterday';
  return `${Math.floor(ms / DAY)}d ago`;
}

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/** Pill of a deadline row: "11 days overdue", "ends today", "ends tomorrow", "ends in 2 days". */
export function deadlinePill(item: DeadlineItem): string {
  if (item.kind === 'milestone') return `${plural(item.daysOverdue, 'day')} overdue`;
  return cycleEnds(item.daysLeft);
}

/** daysLeft counts today (1 on the last day). */
export function cycleEnds(daysLeft: number): string {
  if (daysLeft <= 1) return 'ends today';
  if (daysLeft === 2) return 'ends tomorrow';
  return `ends in ${daysLeft - 1} days`;
}

/** "4 open tasks". */
export function openTasksText(count: number): string {
  return plural(count, 'open task');
}

/** The pill on an agent card: "Stalled 26h" when the queue knows the silence, else "Stalled". */
export function agentStalledText(agent: DashboardAgent, stalled: readonly StalledItem[], now: number | null) {
  if (!agent.stalled) return null;
  const key = agent.currentTask?.key;
  const item = key ? stalled.find((entry) => entry.task.key === key) : undefined;
  return item && now != null ? `Stalled ${silenceAge(item.lastTouchedAt, now)}` : 'Stalled';
}

/** "for Ana Ruiz" after an agent; nothing for people. */
export function responsibleOf(user: Pick<AssigneeRef, 'kind' | 'responsible'> | null | undefined) {
  return user?.kind === 'agent' ? (user.responsible?.name ?? null) : null;
}

/**
 * Line under the title: "Reddevs · you and 2 agents" (Mine) or "Reddevs · 3 people, 4 agents" (Everyone);
 * just the workspace name until members load.
 */
export function workspaceLine(
  workspace: string,
  scope: DashboardScope,
  members: readonly Member[] | undefined,
  meId: string | undefined,
): string {
  if (!members?.length) return workspace;
  const agents = members.filter((member) => member.kind === 'agent');
  if (scope === 'mine') {
    if (!meId) return workspace;
    const mine = agents.filter((agent) => agent.responsible?.id === meId).length;
    return mine ? `${workspace} · you and ${plural(mine, 'agent')}` : `${workspace} · you`;
  }
  const people = members.length - agents.length;
  return `${workspace} · ${plural(people, 'person', 'people')}, ${plural(agents.length, 'agent')}`;
}

// ---------------------------------------------------------------------------
// Mention excerpts
// ---------------------------------------------------------------------------

export type ExcerptPart =
  | { type: 'text'; value: string }
  | { type: 'code'; value: string }
  | { type: 'mention'; value: string };

/**
 * Splits an excerpt into text, `inline code` (the backticks dropped) and @mentions of the given names.
 * The server keeps inline code in backticks and writes mentions as "@Name".
 */
export function excerptParts(excerpt: string, names: readonly string[]): ExcerptPart[] {
  const parts: ExcerptPart[] = [];
  const sorted = [...new Set(names.filter(Boolean))].sort((a, b) => b.length - a.length);
  const pushText = (text: string) => {
    let rest = text;
    while (rest) {
      let at = -1;
      let name = '';
      for (const candidate of sorted) {
        const index = rest.indexOf(`@${candidate}`);
        if (index >= 0 && (at < 0 || index < at)) {
          at = index;
          name = candidate;
        }
      }
      if (at < 0) {
        parts.push({ type: 'text', value: rest });
        return;
      }
      if (at > 0) parts.push({ type: 'text', value: rest.slice(0, at) });
      parts.push({ type: 'mention', value: name });
      rest = rest.slice(at + name.length + 1);
    }
  };
  const segments = excerpt.split('`');
  segments.forEach((segment, index) => {
    // Odd segments sit between backticks; an unmatched last backtick leaves its text as text.
    const isCode = index % 2 === 1 && index < segments.length - 1;
    if (isCode) parts.push({ type: 'code', value: segment });
    else pushText(index % 2 === 1 ? `\`${segment}` : segment);
  });
  return parts;
}

// ---------------------------------------------------------------------------
// Keyboard
// ---------------------------------------------------------------------------

/** Focus id of a group's header line (focused by 1 to 4 when the group is empty). */
export const headerId = (group: QueueGroupId) => `header:${group}`;

export function groupOfFocus(id: string | null): QueueGroupId | null {
  if (!id) return null;
  const [first, second] = id.split(':');
  const group = first === 'header' ? second : first;
  return GROUPS.some((meta) => meta.id === group) ? (group as QueueGroupId) : null;
}

/**
 * The row J (step 1) or K (step -1) moves to, across groups. From nothing, J takes the first row and K the
 * last; from a group header, the rows after or before that group. Stays put at either end.
 */
export function stepFocus(
  rows: readonly { group: QueueGroupId; rows: readonly { id: string }[] }[],
  focusedId: string | null,
  step: 1 | -1,
): string | null {
  const order = rows.flatMap((group) => group.rows.map((row) => row.id));
  if (!order.length) return null;
  const index = focusedId ? order.indexOf(focusedId) : -1;
  if (index >= 0) return order[Math.min(order.length - 1, Math.max(0, index + step))] ?? null;
  const group = focusedId?.startsWith('header:') ? groupOfFocus(focusedId) : null;
  if (group) {
    let before = 0;
    for (const entry of rows) {
      if (entry.group === group) break;
      before += entry.rows.length;
    }
    const target = step === 1 ? order[before] : order[before - 1];
    return target ?? focusedId;
  }
  return step === 1 ? (order[0] ?? null) : (order[order.length - 1] ?? null);
}
