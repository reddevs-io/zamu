import { PRIORITIES, type TaskListItem, type TaskStatus } from '@pm/contracts';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { atTime, formatAge } from '~/features/tasks/format';
import {
  Chip,
  CycleGlyph,
  type DataColumn,
  type DataGroup,
  DataTable,
  MemberLabel,
  PriorityGlyph,
  STATUS_LABELS,
} from '~/ui';
import { formatDay, localDay } from './dates';

// Tasks of a milestone or a cycle, grouped by status in the M1 row style (frames 17 and 24). Open groups
// are expanded; Done and Canceled are folded until someone opens them. Enter or a click opens the task.

/** Group order of the task list: active work first. */
export const STATUS_ORDER: readonly TaskStatus[] = [
  'in_progress',
  'in_review',
  'todo',
  'backlog',
  'done',
  'canceled',
];
const FOLDED: readonly TaskStatus[] = ['done', 'canceled'];

const priorityRank = (item: TaskListItem) => PRIORITIES.indexOf(item.priority);

/** Priority (highest first), then most recently updated, as the M1 list. */
export function compareTasks(a: TaskListItem, b: TaskListItem): number {
  return priorityRank(b) - priorityRank(a) || b.updatedAt.localeCompare(a.updatedAt) || b.number - a.number;
}

export function groupTasks(
  tasks: readonly TaskListItem[],
  statuses: readonly TaskStatus[] = STATUS_ORDER,
): DataGroup<TaskListItem>[] {
  const byStatus = new Map<TaskStatus, TaskListItem[]>();
  for (const task of tasks) {
    const bucket = byStatus.get(task.status);
    if (bucket) bucket.push(task);
    else byStatus.set(task.status, [task]);
  }
  return statuses.flatMap((status) => {
    const items = byStatus.get(status);
    if (!items?.length) return [];
    return [{ id: status, label: STATUS_LABELS[status], status, items: items.sort(compareTasks) }];
  });
}

/** "+ Oct 17" when the task joined the cycle after its first day; '' otherwise or before hydration. */
export function addedMarker(task: TaskListItem, startsOn: string, now: number | null): string {
  if (now == null || !task.cycleAddedAt) return '';
  const day = localDay(Date.parse(task.cycleAddedAt));
  return day > startsOn ? `+ ${formatDay(day)}` : '';
}

export type PlanningColumn = 'cycle' | 'added';

export interface PlanningTaskTableProps {
  'aria-label': string;
  tasks: readonly TaskListItem[];
  /** Third column: the task's cycle chip (milestone page) or the "+ Oct 17" marker (cycle page). */
  extra?: PlanningColumn;
  /** First day of the cycle, for the "+" markers. */
  cycleStartsOn?: string;
  /** Only these statuses, all expanded. Without it every status shows, Done and Canceled folded. */
  statuses?: readonly TaskStatus[];
  isLoading?: boolean;
  now: number | null;
  onOpen: (key: string) => void;
  renderEmptyState?: () => ReactNode;
}

export function PlanningTaskTable({
  tasks,
  extra,
  cycleStartsOn,
  statuses,
  isLoading,
  now,
  onOpen,
  renderEmptyState,
  ...props
}: PlanningTaskTableProps) {
  const groups = useMemo(() => groupTasks(tasks, statuses ?? STATUS_ORDER), [tasks, statuses]);
  const statusKey = statuses?.join(',') ?? '';
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(statusKey ? [] : FOLDED));
  const previousKey = useRef(statusKey);
  useEffect(() => {
    if (previousKey.current === statusKey) return;
    previousKey.current = statusKey;
    setCollapsed(new Set(statusKey ? [] : FOLDED));
  }, [statusKey]);

  const columns = useMemo<DataColumn<TaskListItem>[]>(() => {
    const age = atTime(formatAge, now);
    const third: DataColumn<TaskListItem>[] = !extra
      ? []
      : extra === 'cycle'
        ? [
            {
              id: 'cycle',
              header: 'Cycle',
              width: 70,
              skeleton: 40,
              cell: (task) =>
                task.cycle ? (
                  <Chip glyph={<CycleGlyph />} maxWidth={70} title={cycleTitle(task.cycle)}>
                    {`C${task.cycle.number}`}
                  </Chip>
                ) : null,
            },
          ]
        : [
            {
              id: 'added',
              header: 'Added',
              width: 96,
              skeleton: 0,
              cell: (task) => {
                const marker = cycleStartsOn ? addedMarker(task, cycleStartsOn, now) : '';
                return marker ? (
                  <span className="font-mono text-[10.5px] text-faint" title="Added after the cycle started">
                    {marker}
                  </span>
                ) : null;
              },
            },
          ];
    return [
      {
        id: 'key',
        header: 'Key',
        width: 72,
        isRowHeader: true,
        skeleton: 48,
        cell: (task) => <span className="font-mono text-[10.5px] text-muted">{task.key}</span>,
      },
      {
        id: 'title',
        header: 'Title',
        width: '1fr',
        isRowHeader: true,
        cell: (task) => <span className="truncate">{task.title}</span>,
      },
      ...third,
      {
        id: 'priority',
        header: 'Pri',
        width: 34,
        skeleton: 20,
        cell: (task) => <PriorityGlyph priority={task.priority} />,
      },
      {
        id: 'assignee',
        header: 'Assignee',
        width: 150,
        skeleton: 80,
        cell: (task) =>
          task.assignee ? (
            <MemberLabel
              name={task.assignee.name}
              kind={task.assignee.kind}
              className="text-[12px] text-muted"
            />
          ) : null,
      },
      {
        id: 'updated',
        header: 'Upd',
        width: 34,
        align: 'end',
        skeleton: 24,
        cell: (task) => (
          <time dateTime={task.updatedAt} className="font-mono text-[10px] whitespace-nowrap text-faint">
            {age(task.updatedAt)}
          </time>
        ),
      },
    ];
  }, [extra, cycleStartsOn, now]);

  // Without rows the table header alone reads oddly: show the message on its own.
  if (!isLoading && !groups.length && renderEmptyState) {
    return <div className="min-h-0 flex-1 overflow-auto">{renderEmptyState()}</div>;
  }

  return (
    <DataTable
      aria-label={props['aria-label']}
      columns={columns}
      groups={groups}
      getKey={(task) => task.key}
      isLoading={isLoading}
      skeletonRows={8}
      onRowAction={(key) => onOpen(key)}
      collapsedGroups={collapsed}
      onCollapsedGroupsChange={setCollapsed}
      renderEmptyState={renderEmptyState}
      rowClassName={() => 'cursor-pointer'}
    />
  );
}

function cycleTitle(cycle: NonNullable<TaskListItem['cycle']>): string {
  return cycle.name ? `Cycle ${cycle.number} · ${cycle.name}` : `Cycle ${cycle.number}`;
}
