import type { TaskOwnedField } from '@pm/contracts';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { type ReactNode, type RefObject, useRef, useState } from 'react';
import { CommentComposer } from '~/features/comments/CommentComposer';
import { TaskTimeline } from '~/features/comments/TaskTimeline';
import {
  Banner,
  Button,
  cn,
  Kbd,
  lockedHatch,
  OwnedFieldCaption,
  PageHeader,
  PriorityGlyph,
  Skeleton,
  StatusSquare,
  useCopy,
  useHotkeys,
} from '~/ui';
import { useNow } from './clock';
import { describeError } from './errors';
import { atTime, formatDayTime, formatPageTime } from './format';
import { listSearchFor } from './list-memory';
import {
  BacklogIdTag,
  backlogHistoryQuery,
  extraAssignees,
  LockedValue,
  MirroredCreated,
  MirroredDescription,
  OwnedFieldNote,
  RemovedBanner,
  TaskBacklogBlock,
  TaskSourceStrip,
  useBacklogSummary,
} from './MirroredTask';
import { commentPlaceholder, milestoneBacklogId, mirroredProblem, mirrorOf } from './mirror';
import {
  CyclePicker,
  CycleValue,
  MilestonePicker,
  MilestoneValue,
  useProjectPlanning,
} from './PlanningFields';
import { membersQuery, projectsQuery, type TaskPatch, taskQuery, useUpdateTask } from './queries';
import { createdSub, forLine, RequestHint, useOwnedFieldNote } from './TaskDetailPane';
import {
  AssigneeLabel,
  AssigneePicker,
  EditableDescription,
  EditableTitle,
  PriorityPicker,
  StatusPicker,
} from './TaskFields';

// /p/$projectKey/$taskKey: one task on the whole page (frame 05). Esc goes back to the list with the
// task selected. The history (activity and comments) follows the description, with the comment box
// pinned under it; the right column holds the properties, milestone and cycle included.

export interface TaskPageProps {
  projectKey: string;
  taskKey: string;
}

export function TaskPage({ projectKey, taskKey }: TaskPageProps) {
  const navigate = useNavigate();
  const taskResult = useQuery(taskQuery(taskKey));
  const members = useQuery(membersQuery()).data?.items ?? [];
  const projectName = useQuery({
    ...projectsQuery(),
    select: (data) => data.items.find((item) => item.key === projectKey)?.name,
  }).data;
  const update = useUpdateTask();
  const planning = useProjectPlanning(projectKey);
  const { copied, copy } = useCopy();
  const now = useNow();
  const pageTime = atTime(formatPageTime, now);
  const [openPicker, setOpenPicker] = useState<'milestone' | 'cycle' | null>(null);
  const [revealId, setRevealId] = useState<string | null>(null);
  const milestoneRow = useRef<HTMLDivElement>(null);
  const cycleRow = useRef<HTMLDivElement>(null);
  const statusRow = useRef<HTMLDivElement>(null);
  const priorityRow = useRef<HTMLDivElement>(null);
  const assigneeRow = useRef<HTMLDivElement>(null);
  const createdRow = useRef<HTMLDivElement>(null);
  const noteRefs: Record<TaskOwnedField, RefObject<HTMLDivElement | null>> = {
    status: statusRow,
    priority: priorityRow,
    assignee: assigneeRow,
    milestone: milestoneRow,
    createdAt: createdRow,
    title: statusRow,
    description: statusRow,
  };
  const { summary } = useBacklogSummary(projectKey);
  const { note, setNote } = useOwnedFieldNote(update.error, update.reset);

  const backToList = () =>
    navigate({
      to: '/p/$projectKey',
      params: { projectKey },
      search: listSearchFor(projectKey, taskKey) as never,
    });
  const task = taskResult.data;
  const mirror = mirrorOf(task);
  const isLocked = (field: TaskOwnedField) => mirror.locked.has(field);
  const history = useQuery({ ...backlogHistoryQuery(projectKey), enabled: task?.backlog != null }).data;
  const openNote = (field: TaskOwnedField) => {
    setOpenPicker(null);
    setNote({ field });
  };
  useHotkeys({
    // The owned-field note handles Esc itself while it is open.
    Escape: note ? null : backToList,
    'Shift+M':
      task && planning.usesMilestones
        ? isLocked('milestone')
          ? () => openNote('milestone')
          : () => setOpenPicker('milestone')
        : null,
    'Shift+C': task && planning.usesCycles ? () => setOpenPicker('cycle') : null,
  });
  const locked = (field: TaskOwnedField) =>
    isLocked(field)
      ? { locked: true, dim: mirror.isHidden, rowRef: noteRefs[field], isActive: note?.field === field }
      : {};

  const save = (patch: TaskPatch) => update.mutate({ key: taskKey, patch });
  const pickerOpenChange = (picker: 'milestone' | 'cycle') => (isOpen: boolean) =>
    setOpenPicker((current) => (isOpen ? picker : current === picker ? null : current));

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
          {mirror.backlogId ? <BacklogIdTag backlogId={mirror.backlogId} /> : null}
        </nav>
      </PageHeader>
      {task ? (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex min-h-0 min-w-0 flex-col">
            <article className="flex min-h-0 min-w-0 flex-1 flex-col gap-5 overflow-y-auto px-12 pt-7 pb-6">
              {mirror.isHidden ? (
                <RemovedBanner task={task} branch={summary?.defaultBranch} className="max-w-[720px]" />
              ) : (
                <TaskSourceStrip task={task} mirror={mirror} summary={summary} className="max-w-[720px]" />
              )}
              <EditableTitle
                key={`${taskKey}:title`}
                as="h1"
                size="page"
                value={task.title}
                onSave={isLocked('title') ? undefined : (title) => save({ title })}
              />
              {update.isError && !mirroredProblem(update.error) ? (
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
              {isLocked('description') ? (
                <MirroredDescription key={`${taskKey}:description`} source={task.description} size="page" />
              ) : (
                <EditableDescription
                  key={`${taskKey}:description`}
                  size="page"
                  value={task.description}
                  onSave={(description) => save({ description })}
                />
              )}
              {task.backlog ? (
                <TaskBacklogBlock
                  task={task}
                  projectKey={projectKey}
                  mirror={mirror}
                  className="max-w-[720px]"
                />
              ) : null}
              <TaskTimeline
                taskKey={taskKey}
                members={members}
                size="page"
                revealId={revealId}
                projectHistory={task.backlog ? history : undefined}
                projectName={projectName ?? projectKey}
                branch={summary?.defaultBranch}
                className="mt-2 max-w-[720px]"
              />
            </article>
            <div className="shrink-0 border-t border-line px-12 pt-3 pb-4">
              <CommentComposer
                taskKey={taskKey}
                members={members}
                onSent={setRevealId}
                placeholder={commentPlaceholder(mirror)}
                className="max-w-[720px]"
              />
            </div>
          </div>
          <aside
            aria-label="Properties"
            className="flex min-h-0 flex-col overflow-y-auto border-l border-line"
          >
            <PropertyRow label="Status" {...locked('status')}>
              {isLocked('status') ? (
                <LockedValue field="status" onOpen={openNote}>
                  <StatusSquare status={task.status} withLabel />
                </LockedValue>
              ) : (
                <StatusPicker value={task.status} onChange={(status) => save({ status })} />
              )}
            </PropertyRow>
            <PropertyRow label="Priority" {...locked('priority')}>
              {isLocked('priority') ? (
                <LockedValue field="priority" onOpen={openNote}>
                  <PriorityGlyph priority={task.priority} withLabel />
                </LockedValue>
              ) : (
                <PriorityPicker value={task.priority} onChange={(priority) => save({ priority })} />
              )}
            </PropertyRow>
            <PropertyRow
              label="Assignee"
              sub={extraAssignees(task) ?? forLine(task.assignee)}
              {...locked('assignee')}
            >
              {isLocked('assignee') ? (
                <LockedValue field="assignee" onOpen={openNote}>
                  {task.assignee ? (
                    <AssigneeLabel assignee={task.assignee} className="min-w-0" />
                  ) : (
                    <span className="font-normal text-faint">No assignee</span>
                  )}
                </LockedValue>
              ) : (
                <AssigneePicker
                  value={task.assignee}
                  members={members}
                  onChange={(assignee) => save({ assignee })}
                />
              )}
            </PropertyRow>
            {planning.usesMilestones && isLocked('milestone') ? (
              <PropertyRow
                label="Milestone"
                sub={milestoneBacklogId(task.milestone, planning.milestones) ?? undefined}
                {...locked('milestone')}
              >
                <LockedValue field="milestone" onOpen={openNote}>
                  <MilestoneValue value={task.milestone} milestones={undefined} />
                </LockedValue>
              </PropertyRow>
            ) : planning.usesMilestones ? (
              <PropertyRow
                label="Milestone"
                kbd="⇧M"
                rowRef={milestoneRow}
                isActive={openPicker === 'milestone'}
              >
                <MilestonePicker
                  value={task.milestone}
                  milestones={planning.milestones}
                  onChange={(milestone) => save({ milestone })}
                  isOpen={openPicker === 'milestone'}
                  onOpenChange={pickerOpenChange('milestone')}
                  triggerRef={milestoneRow}
                >
                  <MilestoneValue value={task.milestone} milestones={planning.milestones} />
                </MilestonePicker>
              </PropertyRow>
            ) : null}
            {planning.usesCycles ? (
              <PropertyRow label="Cycle" kbd="⇧C" rowRef={cycleRow} isActive={openPicker === 'cycle'}>
                <CyclePicker
                  value={task.cycle}
                  cycles={planning.cycles}
                  onChange={(cycle) => save({ cycle })}
                  isOpen={openPicker === 'cycle'}
                  onOpenChange={pickerOpenChange('cycle')}
                  triggerRef={cycleRow}
                >
                  <CycleValue value={task.cycle} cycles={planning.cycles} />
                </CyclePicker>
              </PropertyRow>
            ) : null}
            {isLocked('createdAt') ? (
              <PropertyRow label="Created" {...locked('createdAt')}>
                <LockedValue field="createdAt" onOpen={openNote}>
                  <MirroredCreated task={task} />
                </LockedValue>
              </PropertyRow>
            ) : task.backlog ? (
              // Detached or imported: the file's reporter and date, not who set up the mirror.
              <PropertyRow label="Created">
                <MirroredCreated task={task} />
              </PropertyRow>
            ) : (
              <PropertyRow label="Created" sub={createdSub(task, atTime(formatDayTime, now))}>
                <span className="truncate">{task.createdBy.name}</span>
              </PropertyRow>
            )}
            <PropertyRow label="Updated">
              <time dateTime={task.updatedAt}>{pageTime(task.updatedAt)}</time>
            </PropertyRow>
            <OwnedFieldNote
              field={note?.field ?? null}
              problem={note?.problem}
              task={task}
              milestones={planning.milestones}
              branch={summary?.defaultBranch}
              triggerRef={note ? noteRefs[note.field] : statusRow}
              onClose={() => setNote(null)}
              milestoneShortcut={planning.usesMilestones && isLocked('milestone')}
              placement="left top"
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

function PropertyRow({
  label,
  sub,
  kbd,
  rowRef,
  isActive,
  locked,
  dim,
  children,
}: {
  label: string;
  sub?: string;
  /** Shortcut after the caption: "⇧M". */
  kbd?: string;
  /** Anchor for a picker popover. */
  rowRef?: RefObject<HTMLDivElement | null>;
  /** The row's picker is open. */
  isActive?: boolean;
  /** Backlog.md owns the value: hatched ground and "· file" after the caption. */
  locked?: boolean;
  /** Faded (a hidden task's owned values). */
  dim?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      ref={rowRef}
      data-locked={locked || undefined}
      className={cn(
        'grid min-h-11 shrink-0 grid-cols-[96px_minmax(0,1fr)] items-center gap-2.5 border-b border-line-2 px-5 py-1.5',
        locked && lockedHatch,
        isActive && !locked && 'bg-sel',
        isActive && 'outline-2 -outline-offset-2 outline-focus',
        dim && 'opacity-60',
      )}
    >
      <span className="caps flex flex-wrap items-center gap-x-1.5">
        {label}
        {locked ? <OwnedFieldCaption /> : null}
        {kbd ? (
          <Kbd aria-hidden className="tracking-normal">
            {kbd}
          </Kbd>
        ) : null}
      </span>
      <div className="flex min-w-0 flex-col gap-0.5 font-medium">
        <div className="flex min-w-0 items-center gap-[7px]">{children}</div>
        {sub ? <span className="truncate text-[11.5px] font-normal text-muted">{sub}</span> : null}
      </div>
    </div>
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
