import { CYCLE_CURRENT, CYCLE_NEXT, FILTER_NONE, PRIORITIES } from '@pm/contracts';
import type { CycleFilterValue, TaskListFilters } from '~/features/tasks/search';
import { PRIORITY_LABELS, STATUS_LABELS } from '~/ui';

// Words for the active filters: the header subtitle ("filtered: Cycle 12, assigned to agents") and the
// empty board ("Cycle 12 has no tasks assigned to agents.").

export interface FilterNames {
  /** Member names by id. */
  members?: ReadonlyMap<string, string>;
  /** Milestone names by id. */
  milestones?: ReadonlyMap<string, string>;
}

export function cycleName(cycle: CycleFilterValue): string {
  if (cycle === CYCLE_CURRENT) return 'The current cycle';
  if (cycle === CYCLE_NEXT) return 'The next cycle';
  if (cycle === FILTER_NONE) return 'No cycle';
  return `Cycle ${cycle}`;
}

function assigneePhrase(assignee: string, names: FilterNames): string {
  if (assignee === 'me') return 'assigned to you';
  if (assignee === 'agents') return 'assigned to agents';
  return `assigned to ${names.members?.get(assignee) ?? 'one member'}`;
}

function milestonePhrase(milestone: string, names: FilterNames): string {
  if (milestone === FILTER_NONE) return 'without a milestone';
  return `in ${names.milestones?.get(milestone) ?? 'one milestone'}`;
}

/** One phrase per active filter, cycle first: ["Cycle 12", "assigned to agents"]. */
export function describeFilters(filters: TaskListFilters, names: FilterNames = {}): string[] {
  const parts: string[] = [];
  if (filters.cycle !== undefined) {
    const name = cycleName(filters.cycle);
    parts.push(filters.cycle === FILTER_NONE ? 'without a cycle' : name.replace(/^The /, 'the '));
  }
  if (filters.assignee) parts.push(assigneePhrase(filters.assignee, names));
  if (filters.milestone) parts.push(milestonePhrase(filters.milestone, names));
  if (filters.status) parts.push(`in ${filters.status.map((status) => STATUS_LABELS[status]).join(' or ')}`);
  if (filters.priority) {
    const sorted = PRIORITIES.filter((priority) => filters.priority?.includes(priority)).reverse();
    parts.push(`priority ${sorted.map((priority) => PRIORITY_LABELS[priority]).join(' or ')}`);
  }
  if (filters.q?.trim()) parts.push(`matching "${filters.q.trim()}"`);
  return parts;
}

/** Text of the empty board under filters. */
export function emptyBoardText(filters: TaskListFilters, names: FilterNames = {}): string {
  if (filters.cycle !== undefined && filters.cycle !== FILTER_NONE) {
    const rest = describeFilters({ ...filters, cycle: undefined }, names);
    return `${cycleName(filters.cycle)} has no tasks${rest.length ? ` ${rest.join(', ')}` : ''}. Clear the filters, or add tasks to the cycle from the list.`;
  }
  const parts = describeFilters(filters, names);
  return `Nothing matches: ${parts.join(', ')}. Clear the filters, or create a task.`;
}
