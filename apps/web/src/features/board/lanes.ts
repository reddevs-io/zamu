import type { TaskListItem } from '@zamu/contracts';
import {
  type GroupBy,
  type GroupContext,
  groupTasks,
  NO_VALUE_GROUP,
  type TaskGroup,
  type TaskGroupValue,
} from '~/features/views';
import type { MovePatch } from './moves';

// Columns and swimlanes of the board grouped by one field (display options "Columns" and "Swimlanes"):
// the group keys of a card, the cards of each lane per column, and the patch a drop into a group means.

export { NO_VALUE_GROUP as NO_LANE };

/** The group keys a card belongs to under `field` (a card with several labels is in each label group). */
export function groupKeysOf(field: GroupBy, card: TaskListItem): string[] {
  switch (field) {
    case 'status':
      return [card.status];
    case 'priority':
      return [card.priority];
    case 'assignee':
      return [card.assignee?.id ?? NO_VALUE_GROUP];
    case 'milestone':
      return [card.milestone?.id ?? NO_VALUE_GROUP];
    case 'cycle':
      return [card.cycle?.id ?? NO_VALUE_GROUP];
    case 'label':
      return card.labels?.length ? card.labels.map((label) => label.id) : [NO_VALUE_GROUP];
    default:
      return ['all'];
  }
}

/** True when the card is in the group `key` of `field`. */
export function inGroup(field: GroupBy, card: TaskListItem, key: string): boolean {
  return groupKeysOf(field, card).includes(key);
}

/**
 * What dropping a card into a group sets: its priority, assignee, milestone or cycle. Null for
 * groupings a drop can't express (labels, none) and for status (the board's own moves handle it).
 */
export function groupPatch(value: TaskGroupValue): MovePatch | null {
  switch (value.field) {
    case 'priority':
      return { priority: value.priority };
    case 'assignee':
      return { assignee: value.assignee };
    case 'milestone':
      return { milestone: value.milestone };
    case 'cycle':
      return { cycle: value.cycle };
    default:
      return null;
  }
}

/** The owned field a group patch writes, for the Backlog.md lock check. */
export function patchField(field: GroupBy): 'status' | 'priority' | 'assignee' | 'milestone' | null {
  if (field === 'status' || field === 'priority' || field === 'assignee' || field === 'milestone')
    return field;
  return null;
}

export interface Lane {
  /** The group key: a user id, a priority, a milestone id, or NO_LANE. */
  id: string;
  title: string;
  value: TaskGroupValue;
  /** Cards per column id, in board order. */
  cells: Record<string, TaskListItem[]>;
  count: number;
}

/**
 * Groups the cards of each column into lanes by `field`, in groupTasks' order (the viewer first for
 * assignees, milestones by target date, "No …" last). Lanes without cards are left out unless
 * `context.showEmptyGroups` is set.
 */
export function buildLanes(
  field: GroupBy,
  columns: readonly { id: string; cards: readonly TaskListItem[] }[],
  context: GroupContext = {},
): Lane[] {
  const all = columns.flatMap((column) => column.cards);
  const groups: TaskGroup<TaskListItem>[] = groupTasks(all, field, context);
  return groups.map((group) => {
    const keys = new Set(group.tasks.map((task) => task.key));
    const cells: Record<string, TaskListItem[]> = {};
    for (const column of columns) cells[column.id] = column.cards.filter((card) => keys.has(card.key));
    return { id: group.key, title: group.label, value: group.value, cells, count: group.tasks.length };
  });
}
