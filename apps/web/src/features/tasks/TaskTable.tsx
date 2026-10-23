import type { TaskListItem } from '@pm/contracts';
import { parentKeyOf } from '~/features/project-header/mirror';
import { type DataColumn, MemberLabel, PriorityGlyph } from '~/ui';
import { atTime, formatAge, formatDay } from './format';

// Columns of the task list, from LgTasks: key 72, title, pri 34, assignee 112, upd 34.
// DataTable re-renders every row when the columns array changes, so memoize the result on `now`
// (useNow() changes it every 30 seconds) and the options.
//
// Mirrored projects (M3): keys may carry a suffix (PAY-786.1.2), so the key column is wider and a
// subtask's title ends with "sub of PAY-786". The hidden-tasks list swaps priority and assignee for
// "removed Oct 22 · 3 comments" and shows the removal day in the last column.

export interface TaskColumnOptions {
  /** Wider key column for suffixed keys (projects with a Backlog.md source, detached ones too). */
  wideKeys?: boolean;
  /** The hidden-tasks list (?hidden=only). */
  hidden?: boolean;
}

function KeyCell({ task }: { task: TaskListItem }) {
  return <span className="font-mono text-[10.5px] whitespace-nowrap text-muted">{task.key}</span>;
}

function TitleCell({ task }: { task: TaskListItem }) {
  const parent = parentKeyOf(task.key);
  return (
    <span className="flex min-w-0 items-baseline gap-1.5">
      <span className="truncate">{task.title}</span>
      {parent ? (
        <span className="shrink-0 text-[11px] whitespace-nowrap text-faint">sub of {parent}</span>
      ) : null}
    </span>
  );
}

/** "removed Oct 22 · 3 comments". */
export function removedText(task: TaskListItem, now: Date): string {
  const parts = [task.hiddenAt ? `removed ${formatDay(task.hiddenAt, now)}` : 'removed'];
  const comments = task.commentCount ?? 0;
  if (comments) parts.push(`${comments} ${comments === 1 ? 'comment' : 'comments'}`);
  return parts.join(' · ');
}

export function taskColumns(now: number | null, options: TaskColumnOptions = {}): DataColumn<TaskListItem>[] {
  const age = atTime(formatAge, now);
  const day = atTime(formatDay, now);
  // Relative and local times render only after hydration (now is null on the server).
  const clock = now == null ? null : new Date(now);
  const key: DataColumn<TaskListItem> = {
    id: 'key',
    header: 'Key',
    width: options.wideKeys || options.hidden ? 84 : 72,
    isRowHeader: true,
    skeleton: 48,
    cell: (task) => <KeyCell task={task} />,
  };
  const title: DataColumn<TaskListItem> = {
    id: 'title',
    header: 'Title',
    width: '1fr',
    isRowHeader: true,
    cell: (task) => <TitleCell task={task} />,
  };
  if (options.hidden) {
    return [
      key,
      title,
      {
        id: 'removed',
        header: 'Removed',
        width: 150,
        skeleton: 90,
        cell: (task) => (
          <span className="truncate text-[11.5px] text-muted">{clock ? removedText(task, clock) : ''}</span>
        ),
      },
      {
        id: 'updated',
        header: 'Removed on',
        width: 48,
        align: 'end',
        skeleton: 30,
        cell: (task) =>
          task.hiddenAt ? (
            <time dateTime={task.hiddenAt} className="font-mono text-[10px] whitespace-nowrap text-faint">
              {day(task.hiddenAt)}
            </time>
          ) : null,
      },
    ];
  }
  return [
    key,
    title,
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
