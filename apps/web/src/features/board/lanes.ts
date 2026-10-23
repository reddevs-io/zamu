import type { AssigneeRef, MilestoneRef, TaskListItem, TaskStatus } from '@pm/contracts';
import type { BoardLanes } from '~/features/tasks/search';

// Swimlanes: the board's cards grouped by assignee or by milestone, one row of cells per lane.

export const NO_LANE = 'none';

export interface Lane {
  /** User id, milestone id, or NO_LANE. */
  id: string;
  title: string;
  /** The lane's assignee (assignee lanes); null for "No assignee". */
  assignee?: AssigneeRef | null;
  /** The lane's milestone (milestone lanes); null for "No milestone". */
  milestone?: MilestoneRef | null;
  /** Cards per status, in board order. */
  cells: Partial<Record<TaskStatus, TaskListItem[]>>;
  count: number;
}

/** Lane id of a card. */
export function laneOf(mode: BoardLanes, card: TaskListItem): string {
  if (mode === 'assignee') return card.assignee?.id ?? NO_LANE;
  return card.milestone?.id ?? NO_LANE;
}

/**
 * Groups the cards of each column into lanes. Assignee lanes: agents, then people, by name, then
 * "No assignee". Milestone lanes: in `milestoneOrder` (the milestone list, by target date), unknown ones
 * by name, then "No milestone". Only lanes with cards are returned.
 */
export function buildLanes(
  mode: BoardLanes,
  columns: readonly { status: TaskStatus; cards: readonly TaskListItem[] }[],
  milestoneOrder: readonly string[] = [],
): Lane[] {
  const lanes = new Map<string, Lane>();
  for (const { status, cards } of columns) {
    for (const card of cards) {
      const id = laneOf(mode, card);
      let lane = lanes.get(id);
      if (!lane) {
        lane =
          mode === 'assignee'
            ? {
                id,
                title: card.assignee?.name ?? 'No assignee',
                assignee: card.assignee,
                cells: {},
                count: 0,
              }
            : {
                id,
                title: card.milestone?.name ?? 'No milestone',
                milestone: card.milestone,
                cells: {},
                count: 0,
              };
        lanes.set(id, lane);
      }
      const cell = lane.cells[status];
      if (cell) cell.push(card);
      else lane.cells[status] = [card];
      lane.count++;
    }
  }
  const sortKey = (lane: Lane): [number, number, string] => {
    if (lane.id === NO_LANE) return [9, 0, ''];
    if (mode === 'assignee') return [lane.assignee?.kind === 'agent' ? 0 : 1, 0, lane.title.toLowerCase()];
    const index = milestoneOrder.indexOf(lane.id);
    return index >= 0 ? [0, index, ''] : [1, 0, lane.title.toLowerCase()];
  };
  return [...lanes.values()].sort((a, b) => {
    const [ga, ia, na] = sortKey(a);
    const [gb, ib, nb] = sortKey(b);
    return ga - gb || ia - ib || na.localeCompare(nb);
  });
}
