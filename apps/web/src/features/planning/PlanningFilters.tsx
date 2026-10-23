import { FILTER_NONE, type TaskListItem, type TaskStatus } from '@pm/contracts';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { membersQuery } from '~/features/tasks/queries';
import {
  CycleGlyph,
  isMilestoneFilled,
  MilestoneGlyph,
  NoneGlyph,
  type OptionItem,
  Select,
  STATUS_LABELS,
  StatusSquare,
} from '~/ui';
import { STATUS_ORDER } from './PlanningTaskTable';
import { cyclesQuery, milestonesQuery } from './queries';
import type { PlanningTasksSearch } from './search';

// Filters of the milestone page (Status, Assignee, Cycle) and the cycle page (Status, Assignee,
// Milestone). Status filters on the client; assignee, cycle and milestone go to GET /tasks.

const ANY = 'any';

const STATUS_ITEMS: OptionItem[] = STATUS_ORDER.map((status) => ({
  id: status,
  label: STATUS_LABELS[status],
  prefix: <StatusSquare status={status} />,
}));

export interface PlanningFiltersProps {
  projectKey: string;
  search: PlanningTasksSearch;
  onChange: (next: PlanningTasksSearch) => void;
  /** The third filter: Cycle on a milestone page, Milestone on a cycle page. Omitted when the project has it off. */
  third?: 'cycle' | 'milestone';
  /** Text of the status filter with nothing picked: "Open" (milestone page) or "Any". */
  statusPlaceholder?: string;
}

export function PlanningFilters({
  projectKey,
  search,
  onChange,
  third,
  statusPlaceholder = 'Any',
}: PlanningFiltersProps) {
  const members = useQuery(membersQuery()).data?.items;
  const milestones = useQuery({ ...milestonesQuery(projectKey), enabled: third === 'milestone' }).data?.items;
  const cycles = useQuery({ ...cyclesQuery(projectKey), enabled: third === 'cycle' }).data?.items;

  const assigneeItems = useMemo<OptionItem[]>(
    () => [
      { id: ANY, label: 'Any' },
      { id: 'me', label: 'Me' },
      { id: 'agents', label: 'Agents' },
      { id: FILTER_NONE, label: 'No assignee' },
      ...(members ?? []).map((member) => ({
        id: member.id,
        label: member.name,
        avatar: { name: member.name, kind: member.kind },
      })),
    ],
    [members],
  );

  const cycleItems = useMemo<OptionItem[]>(
    () => [
      { id: ANY, label: 'Any' },
      { id: 'current', label: 'Current', prefix: <CycleGlyph state="progress" /> },
      { id: 'next', label: 'Next', prefix: <CycleGlyph /> },
      { id: FILTER_NONE, label: 'No cycle', prefix: <NoneGlyph shape="circle" /> },
      ...[...(cycles ?? [])]
        .sort((a, b) => b.number - a.number)
        .map((cycle) => ({
          id: String(cycle.number),
          label: `Cycle ${cycle.number}`,
          ...(cycle.name ? { description: cycle.name } : {}),
          prefix: (
            <CycleGlyph
              state={cycle.state === 'completed' ? 'done' : cycle.state === 'current' ? 'progress' : 'empty'}
            />
          ),
        })),
    ],
    [cycles],
  );

  const milestoneItems = useMemo<OptionItem[]>(
    () => [
      { id: ANY, label: 'Any' },
      { id: FILTER_NONE, label: 'No milestone', prefix: <NoneGlyph /> },
      ...(milestones ?? []).map((milestone) => ({
        id: milestone.id,
        label: milestone.name,
        prefix: <MilestoneGlyph filled={isMilestoneFilled(milestone.status)} />,
      })),
    ],
    [milestones],
  );

  const set = (key: keyof PlanningTasksSearch, value: string | null | undefined) => {
    const next = { ...search };
    if (value == null || value === ANY) delete next[key];
    else (next as Record<string, string>)[key] = value;
    onChange(next);
  };

  return (
    <>
      <Select
        label="Status"
        variant="filter"
        selectionMode="multiple"
        placeholder={statusPlaceholder}
        items={STATUS_ITEMS}
        value={search.status ?? []}
        onChange={(keys) =>
          onChange({ ...search, status: keys.length ? (keys.map(String) as TaskStatus[]) : undefined })
        }
      />
      <Select
        label="Assignee"
        variant="filter"
        items={assigneeItems}
        value={search.assignee ?? ANY}
        onChange={(key) => set('assignee', key == null ? null : String(key))}
      />
      {third === 'cycle' ? (
        <Select
          label="Cycle"
          variant="filter"
          items={cycleItems}
          value={search.cycle ?? ANY}
          onChange={(key) => set('cycle', key == null ? null : String(key))}
        />
      ) : null}
      {third === 'milestone' ? (
        <Select
          label="Milestone"
          variant="filter"
          items={milestoneItems}
          value={search.milestone ?? ANY}
          onChange={(key) => set('milestone', key == null ? null : String(key))}
        />
      ) : null}
    </>
  );
}

/** Applies the assignee "none" filter, which GET /tasks does not take, on the client. */
export function filterUnassigned(
  tasks: readonly TaskListItem[],
  search: PlanningTasksSearch,
): TaskListItem[] {
  return search.assignee === FILTER_NONE ? tasks.filter((task) => !task.assignee) : [...tasks];
}

/** The GET /tasks filters of a planning page's search. */
export function taskFilters(search: PlanningTasksSearch): {
  assignee?: string;
  cycle?: string;
  milestone?: string;
} {
  return {
    ...(search.assignee && search.assignee !== FILTER_NONE ? { assignee: search.assignee } : {}),
    ...(search.cycle ? { cycle: search.cycle } : {}),
    ...(search.milestone ? { milestone: search.milestone } : {}),
  };
}
