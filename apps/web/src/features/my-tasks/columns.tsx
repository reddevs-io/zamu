import type { TaskListItem } from '@pm/contracts';
import { atTime, formatAge } from '~/features/tasks/format';
import { Chip, type DataColumn, isMilestoneFilled, MilestoneGlyph, PriorityGlyph } from '~/ui';

// Columns of My tasks, from M2MyTasks: key 72, title, project 150, milestone 120, pri 34, upd 40.
// With the task panel open: key, title, pri, upd. Memoize the result on `now` and `compact`: DataTable
// re-renders every row when the columns change.

export function myTaskColumns(now: number | null, compact: boolean): DataColumn<TaskListItem>[] {
  const age = atTime(formatAge, now);
  const key: DataColumn<TaskListItem> = {
    id: 'key',
    header: 'Key',
    width: 72,
    isRowHeader: true,
    skeleton: 52,
    cell: (task) => <span className="font-mono text-[10.5px] text-muted">{task.key}</span>,
  };
  const title: DataColumn<TaskListItem> = {
    id: 'title',
    header: 'Title',
    width: '1fr',
    isRowHeader: true,
    cell: (task) => <span className="truncate">{task.title}</span>,
  };
  const project: DataColumn<TaskListItem> = {
    id: 'project',
    header: 'Project',
    width: 150,
    skeleton: 90,
    cell: (task) => (
      <span className="flex min-w-0 items-center gap-1.5 text-[12px] whitespace-nowrap text-muted">
        <span className="border border-line px-1 font-mono text-[9.5px] leading-[15px]">
          {task.project.key}
        </span>
        <span className="truncate" title={task.project.name}>
          {task.project.name}
        </span>
      </span>
    ),
  };
  const milestone: DataColumn<TaskListItem> = {
    id: 'milestone',
    header: 'Milestone',
    width: 120,
    skeleton: 70,
    cell: (task) =>
      task.milestone ? (
        <Chip glyph={<MilestoneGlyph filled={isMilestoneFilled(task.milestone.status)} />} maxWidth={120}>
          {task.milestone.name}
        </Chip>
      ) : null,
  };
  const priority: DataColumn<TaskListItem> = {
    id: 'priority',
    header: 'Pri',
    width: 34,
    skeleton: 20,
    cell: (task) => <PriorityGlyph priority={task.priority} />,
  };
  const updated: DataColumn<TaskListItem> = {
    id: 'updated',
    header: 'Upd',
    width: 40,
    align: 'end',
    skeleton: 24,
    cell: (task) => (
      <time dateTime={task.updatedAt} className="font-mono text-[10px] whitespace-nowrap text-faint">
        {age(task.updatedAt)}
      </time>
    ),
  };
  return compact ? [key, title, priority, updated] : [key, title, project, milestone, priority, updated];
}
