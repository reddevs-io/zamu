import type { TaskListItem } from '@pm/contracts';
import { type DataColumn, MemberLabel, PriorityGlyph } from '~/ui';
import { atTime, formatAge } from './format';

// Columns of the task list, from LgTasks: key 72, title, pri 34, assignee 112, upd 34.
// DataTable re-renders every row when the columns array changes, so memoize the result on `now`
// (useNow() changes it every 30 seconds).

export function taskColumns(now: number | null): DataColumn<TaskListItem>[] {
  const age = atTime(formatAge, now);
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
      width: 112,
      skeleton: 70,
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
}
