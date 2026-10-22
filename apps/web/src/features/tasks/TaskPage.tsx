import type { Activity } from '@pm/contracts';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { Avatar, Banner, Button, PageHeader, Skeleton, useCopy, useHotkeys } from '~/ui';
import { useNow } from './clock';
import { describeError } from './errors';
import { atTime, describeActivity, formatDayTime, formatPageTime } from './format';
import { listSearchFor } from './list-memory';
import {
  activityQuery,
  membersQuery,
  projectsQuery,
  type TaskPatch,
  taskQuery,
  useUpdateTask,
} from './queries';
import { createdSub, forLine, RequestHint } from './TaskDetailPane';
import {
  AssigneePicker,
  EditableDescription,
  EditableTitle,
  PriorityPicker,
  StatusPicker,
} from './TaskFields';

// /p/$projectKey/$taskKey: one task on the whole page (frame 05). Esc goes back to the list with the
// task selected.

export interface TaskPageProps {
  projectKey: string;
  taskKey: string;
}

export function TaskPage({ projectKey, taskKey }: TaskPageProps) {
  const navigate = useNavigate();
  const taskResult = useQuery(taskQuery(taskKey));
  const activity = useQuery(activityQuery(taskKey));
  const members = useQuery(membersQuery()).data?.items ?? [];
  const projectName = useQuery({
    ...projectsQuery(),
    select: (data) => data.items.find((item) => item.key === projectKey)?.name,
  }).data;
  const update = useUpdateTask();
  const { copied, copy } = useCopy();
  const now = useNow();
  const pageTime = atTime(formatPageTime, now);

  const backToList = () =>
    navigate({
      to: '/p/$projectKey',
      params: { projectKey },
      search: listSearchFor(projectKey, taskKey) as never,
    });
  useHotkeys({ Escape: backToList });

  const task = taskResult.data;
  const save = (patch: TaskPatch) => update.mutate({ key: taskKey, patch });

  return (
    <div className="flex h-dvh min-h-0 min-w-0 flex-1 flex-col bg-bg text-fg">
      <PageHeader
        actions={
          <>
            <Button variant="secondary" onPress={() => copy(window.location.href)}>
              {copied ? 'Copied' : 'Copy link'}
            </Button>
            <Button variant="secondary" kbd="Esc" onPress={backToList}>
              Back to list
            </Button>
          </>
        }
      >
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-muted">
          <Link
            to="/p/$projectKey"
            params={{ projectKey }}
            search={listSearchFor(projectKey, taskKey) as never}
            className="truncate outline-none hover:text-fg focus-visible:focus-ring"
          >
            {projectName ?? projectKey}
          </Link>
          <span aria-hidden>/</span>
          <span aria-current="page" className="font-mono text-fg">
            {taskKey}
          </span>
        </nav>
      </PageHeader>
      {task ? (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex min-h-0 min-w-0 flex-col">
            <article className="flex min-h-0 min-w-0 flex-1 flex-col gap-5 overflow-y-auto px-12 pt-7 pb-6">
              <EditableTitle
                key={`${taskKey}:title`}
                as="h1"
                size="page"
                value={task.title}
                onSave={(title) => save({ title })}
              />
              {update.isError ? (
                <Banner
                  className="max-w-[720px]"
                  action={
                    <Button variant="secondary" size="sm" onPress={() => update.reset()}>
                      Dismiss
                    </Button>
                  }
                >
                  Couldn't save your change, so it was undone. {describeError(update.error).message}
                </Banner>
              ) : null}
              <EditableDescription
                key={`${taskKey}:description`}
                size="page"
                value={task.description}
                onSave={(description) => save({ description })}
              />
            </article>
            <div className="mx-12 mt-1 mb-5 flex h-10 max-w-[720px] shrink-0 items-center border border-dashed border-line px-3 text-faint">
              Comments arrive in a later release.
            </div>
          </div>
          <aside
            aria-label="Properties"
            className="flex min-h-0 flex-col overflow-y-auto border-l border-line"
          >
            <PropertyRow label="Status">
              <StatusPicker value={task.status} onChange={(status) => save({ status })} />
            </PropertyRow>
            <PropertyRow label="Priority">
              <PriorityPicker value={task.priority} onChange={(priority) => save({ priority })} />
            </PropertyRow>
            <PropertyRow label="Assignee" sub={forLine(task.assignee)}>
              <AssigneePicker
                value={task.assignee}
                members={members}
                onChange={(assignee) => save({ assignee })}
              />
            </PropertyRow>
            <PropertyRow label="Created" sub={createdSub(task, atTime(formatDayTime, now))}>
              <span className="truncate">{task.createdBy.name}</span>
            </PropertyRow>
            <PropertyRow label="Updated">
              <time dateTime={task.updatedAt}>{pageTime(task.updatedAt)}</time>
            </PropertyRow>
            <div className="caps px-5 pt-[18px]">Activity</div>
            <PageActivity
              items={activity.data?.items}
              isError={activity.isError}
              onRetry={() => activity.refetch()}
              time={pageTime}
            />
          </aside>
        </div>
      ) : taskResult.isError ? (
        <TaskPageError error={taskResult.error} onRetry={() => taskResult.refetch()} taskKey={taskKey} />
      ) : (
        <TaskPageSkeleton />
      )}
    </div>
  );
}

function PropertyRow({ label, sub, children }: { label: string; sub?: string; children: ReactNode }) {
  return (
    <div className="grid min-h-11 shrink-0 grid-cols-[96px_minmax(0,1fr)] items-center gap-2.5 border-b border-line-2 px-5 py-1.5">
      <span className="caps">{label}</span>
      <div className="flex min-w-0 flex-col gap-0.5 font-medium">
        <div className="flex min-w-0 items-center gap-[7px]">{children}</div>
        {sub ? <span className="truncate text-[11.5px] font-normal text-muted">{sub}</span> : null}
      </div>
    </div>
  );
}

function PageActivity({
  items,
  isError,
  onRetry,
  time,
}: {
  items: Activity[] | undefined;
  isError: boolean;
  onRetry: () => void;
  time: (value: string) => string;
}) {
  if (!items) {
    return (
      <div className="flex flex-col gap-3 px-5 py-4" aria-busy={!isError}>
        {isError ? (
          <p className="m-0 text-[12.5px] text-muted">
            Couldn't load the activity.{' '}
            <button type="button" onClick={onRetry} className="cursor-pointer text-fg underline">
              Retry
            </button>
          </p>
        ) : (
          <>
            <Skeleton width="70%" />
            <Skeleton width="55%" />
          </>
        )}
      </div>
    );
  }
  return (
    <ol className="m-0 flex list-none flex-col gap-3 px-5 py-4">
      {items.map((item) => (
        <li
          key={item.id}
          className="grid grid-cols-[18px_minmax(0,1fr)] gap-2.5 text-[12.5px] leading-[1.45] text-muted"
        >
          <Avatar name={item.actor.name} kind={item.actor.kind} decorative />
          <span>
            <b className="font-semibold text-fg">{item.actor.name}</b>
            {item.onBehalfOf ? ` for ${item.onBehalfOf.name}` : null} {describeActivity(item)}
            <time dateTime={item.createdAt} className="mt-px block font-mono text-[10px] text-faint">
              {time(item.createdAt)}
            </time>
          </span>
        </li>
      ))}
    </ol>
  );
}

function TaskPageError({
  error,
  onRetry,
  taskKey,
}: {
  error: unknown;
  onRetry: () => void;
  taskKey: string;
}) {
  const described = describeError(error);
  return (
    <div className="max-w-[720px] px-12 py-7">
      <Banner
        action={
          <Button variant="secondary" size="sm" onPress={onRetry}>
            Retry
          </Button>
        }
      >
        Couldn't load {taskKey}. {described.message}
      </Banner>
      {described.requestId ? <RequestHint requestId={described.requestId} /> : null}
    </div>
  );
}

function TaskPageSkeleton() {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_320px]" aria-busy="true">
      <div className="flex flex-col gap-3.5 px-12 pt-8">
        <Skeleton width="70%" height={18} />
        <Skeleton width="45%" height={18} />
        <Skeleton width="90%" className="mt-4" />
        <Skeleton width="96%" />
        <Skeleton width="60%" />
      </div>
      <div className="flex flex-col gap-4 border-l border-line px-5 pt-5">
        <Skeleton width="60%" />
        <Skeleton width="50%" />
        <Skeleton width="70%" />
      </div>
    </div>
  );
}
