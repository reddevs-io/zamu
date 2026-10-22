import type { Activity, AssigneeRef, Task, TaskListItem } from '@pm/contracts';
import { type UseQueryResult, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import {
  type ActivityEntry,
  ActivityTimeline,
  Banner,
  Button,
  Kbd,
  PageHeader,
  PropertyGrid,
  Skeleton,
} from '~/ui';
import { useNow } from './clock';
import { describeError } from './errors';
import { atTime, describeActivity, formatDay, formatPaneTime } from './format';
import { activityQuery, membersQuery, type TaskPatch, taskQuery, useUpdateTask } from './queries';
import {
  AssigneePicker,
  EditableDescription,
  EditableTitle,
  PriorityPicker,
  StatusPicker,
} from './TaskFields';

// Right-hand pane of the task list: the selected task, editable in place.

export interface TaskDetailPaneProps {
  projectKey: string;
  taskKey: string;
  /** The list row, shown at once while the full task loads, so J/K never waits on the network. */
  preview?: TaskListItem;
  /** Clears the selection (Esc). */
  onClose: () => void;
}

const SETTLE_MS = 120;

/** False for `ms` after mount, then true. */
function useSettled(ms: number): boolean {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(true), ms);
    return () => clearTimeout(timer);
  }, [ms]);
  return settled;
}

export function TaskDetailPane({ projectKey, taskKey, preview, onClose }: TaskDetailPaneProps) {
  // While J/K races through rows the pane shows the list row; the full task loads once the selection rests.
  const settled = useSettled(SETTLE_MS);
  const taskResult = useQuery({ ...taskQuery(taskKey), enabled: settled });
  const activityResult = useQuery({ ...activityQuery(taskKey), enabled: settled });
  const members = useQuery(membersQuery()).data?.items ?? [];
  const update = useUpdateTask();
  const now = useNow();

  const task = taskResult.data;
  const shown = task ?? preview;

  const header = (
    <PageHeader>
      <span className="font-mono text-[13px] text-fg">{taskKey}</span>
      <span className="flex-1" />
      <Link
        to="/p/$projectKey/$taskKey"
        params={{ projectKey, taskKey }}
        className="text-muted outline-none hover:text-fg focus-visible:focus-ring"
      >
        Open as page
      </Link>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close the pane"
        title="Close (Esc)"
        className="cursor-pointer outline-none focus-visible:focus-ring"
      >
        <Kbd>Esc</Kbd>
      </button>
    </PageHeader>
  );

  if (!shown) {
    if (taskResult.isError) {
      const error = describeError(taskResult.error);
      return (
        <>
          {header}
          <div className="px-7 py-[22px]">
            <Banner
              action={
                <Button variant="secondary" size="sm" onPress={() => taskResult.refetch()}>
                  Retry
                </Button>
              }
            >
              Couldn't load {taskKey}. {error.message}
            </Banner>
            {error.requestId ? <RequestHint requestId={error.requestId} /> : null}
          </div>
        </>
      );
    }
    return <PaneSkeleton />;
  }

  const save = (patch: TaskPatch) => update.mutate({ key: taskKey, patch });

  return (
    <>
      {header}
      <div className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto px-7 pt-[22px] pb-4">
        <EditableTitle key={`${taskKey}:title`} value={shown.title} onSave={(title) => save({ title })} />
        {update.isError ? (
          <Banner
            action={
              <Button variant="secondary" size="sm" onPress={() => update.reset()}>
                Dismiss
              </Button>
            }
          >
            Couldn't save your change, so it was undone. {describeError(update.error).message}
          </Banner>
        ) : null}
        <PropertyGrid
          items={[
            {
              id: 'status',
              label: 'Status',
              value: <StatusPicker value={shown.status} onChange={(status) => save({ status })} />,
            },
            {
              id: 'priority',
              label: 'Priority',
              value: <PriorityPicker value={shown.priority} onChange={(priority) => save({ priority })} />,
            },
            {
              id: 'assignee',
              label: 'Assignee',
              value: (
                <AssigneePicker
                  value={shown.assignee}
                  members={members}
                  onChange={(assignee) => save({ assignee })}
                />
              ),
              sub: forLine(shown.assignee),
            },
            task
              ? {
                  id: 'created',
                  label: 'Created',
                  value: <span className="truncate">{task.createdBy.name}</span>,
                  sub: createdSub(task, atTime(formatDay, now)),
                }
              : {
                  id: 'created',
                  label: 'Created',
                  value: <Skeleton width={70} />,
                  sub: <Skeleton width={40} />,
                },
          ]}
        />
        {task ? (
          <EditableDescription
            key={`${taskKey}:description`}
            value={task.description}
            onSave={(description) => save({ description })}
          />
        ) : (
          <div className="flex flex-col gap-2.5" aria-busy="true">
            <Skeleton width="90%" />
            <Skeleton width="96%" />
            <Skeleton width="70%" />
          </div>
        )}
        <div className="caps border-t border-line pt-3.5">Activity</div>
        <ActivityList result={activityResult} now={now} />
      </div>
      <div className="mx-7 mt-3 mb-[18px] flex h-[38px] shrink-0 items-center border border-dashed border-line px-3 text-faint">
        Comments arrive in a later release.
      </div>
    </>
  );
}

function ActivityList({
  result,
  now,
}: {
  result: UseQueryResult<{ items: Activity[] }>;
  now: number | null;
}) {
  if (result.data) {
    const time = atTime(formatPaneTime, now);
    return <ActivityTimeline items={result.data.items.map((item) => toEntry(item, time))} />;
  }
  if (result.isError) {
    return (
      <p className="m-0 text-[12.5px] text-muted">
        Couldn't load the activity.{' '}
        <button
          type="button"
          onClick={() => result.refetch()}
          className="cursor-pointer text-fg underline outline-none focus-visible:focus-ring"
        >
          Retry
        </button>
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3" aria-busy="true">
      <Skeleton width="60%" />
      <Skeleton width="72%" />
    </div>
  );
}

export function toEntry(activity: Activity, format: (value: string) => string): ActivityEntry {
  return {
    id: activity.id,
    actor: { name: activity.actor.name, kind: activity.actor.kind },
    onBehalfOf: activity.onBehalfOf?.name,
    action: describeActivity(activity),
    time: format(activity.createdAt),
    dateTime: activity.createdAt,
  };
}

/** "for Ana Ruiz" under an agent assignee. */
export function forLine(assignee: AssigneeRef | null): string | undefined {
  return assignee?.kind === 'agent' && assignee.responsible ? `for ${assignee.responsible.name}` : undefined;
}

/** "Oct 20" for people, "for Ana Ruiz · Oct 20" when an agent created the task. */
export function createdSub(task: Task, format: (value: string) => string): string {
  const when = format(task.createdAt);
  if (!task.createdOnBehalfOf) return when;
  return when ? `for ${task.createdOnBehalfOf.name} · ${when}` : `for ${task.createdOnBehalfOf.name}`;
}

export function RequestHint({ requestId, prefix }: { requestId: string; prefix?: string }) {
  return (
    <p className="m-0 mt-2.5 text-[11.5px] text-muted">
      {prefix ? `${prefix} ` : ''}If this keeps happening, an admin can check the server logs for request{' '}
      <code className="bg-band px-1 py-px font-mono text-[11px]">{requestId}</code>.
    </p>
  );
}

/** Loading state of the pane, as designed: key bar, two title lines, the property box, three lines. */
export function PaneSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col" aria-busy="true">
      <PageHeader>
        <Skeleton width={70} />
      </PageHeader>
      <div className="flex flex-col gap-3.5 px-7 py-[26px]">
        <Skeleton width="80%" height={14} />
        <Skeleton width="55%" height={14} />
        <Skeleton width="100%" height={44} className="mt-2" />
        <Skeleton width="90%" />
        <Skeleton width="96%" />
        <Skeleton width="70%" />
      </div>
    </div>
  );
}
