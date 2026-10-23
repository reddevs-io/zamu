import type { Activity, AssigneeRef, Task, TaskListItem, TaskOwnedField } from '@pm/contracts';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { type ReactNode, type RefObject, useEffect, useRef, useState } from 'react';
import { CommentComposer } from '~/features/comments/CommentComposer';
import { TaskTimeline } from '~/features/comments/TaskTimeline';
import {
  type ActivityEntry,
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
  useHotkeys,
} from '~/ui';
import { useNow } from './clock';
import { describeError } from './errors';
import { atTime, describeActivity, findCheckboxes, formatDay } from './format';
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
import {
  membersQuery,
  projectsQuery,
  type TaskPatch,
  taskQuery,
  timelineQuery,
  useUpdateTask,
} from './queries';
import {
  AssigneeLabel,
  AssigneePicker,
  EditableDescription,
  EditableTitle,
  PriorityPicker,
  StatusPicker,
} from './TaskFields';

// Right-hand pane of the task list, the board and My tasks: the selected task, editable in place, with its
// history (activity and comments) and the comment box pinned at the bottom.

export interface TaskDetailPaneProps {
  /** The task's project. */
  projectKey: string;
  taskKey: string;
  /** The list row, shown at once while the full task loads, so J/K never waits on the network. */
  preview?: TaskListItem;
  /** Clears the selection (Esc). */
  onClose: () => void;
  /**
   * Shows "in <project name>" after the key, for screens that mix projects (My tasks). Optional; off by
   * default.
   */
  showProject?: boolean;
  /**
   * Scrolls the history to the newest comment once it loads (the dashboard opens mentions this way, so the
   * question sits next to the reply box). Off by default.
   */
  revealNewestComment?: boolean;
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

type OpenPicker = 'milestone' | 'cycle' | null;

/** The owned-field note that is open, with the server's answer when a write was refused. */
export interface OpenNote {
  field: TaskOwnedField;
  problem?: { hint?: string; file?: string; message?: string } | null;
}

/**
 * State of the owned-field note: which field it explains, and opening it for a write the server refused
 * with 409 TASK_MIRRORED (the UI blocks owned fields up front, so this only happens on stale data).
 */
export function useOwnedFieldNote(updateError: unknown, resetUpdate: () => void) {
  const [note, setNote] = useState<OpenNote | null>(null);
  useEffect(() => {
    const problem = mirroredProblem(updateError);
    if (!problem) return;
    setNote({ field: problem.field, problem });
    resetUpdate();
  }, [updateError, resetUpdate]);
  return { note, setNote };
}

export function TaskDetailPane({
  projectKey,
  taskKey,
  preview,
  onClose,
  showProject,
  revealNewestComment = false,
}: TaskDetailPaneProps) {
  // While J/K races through rows the pane shows the list row; the full task loads once the selection rests.
  const settled = useSettled(SETTLE_MS);
  const taskResult = useQuery({ ...taskQuery(taskKey), enabled: settled });
  const members = useQuery(membersQuery()).data?.items ?? [];
  const projectName = useQuery({
    ...projectsQuery(),
    select: (data) => data.items.find((item) => item.key === projectKey)?.name,
    enabled: showProject === true,
  }).data;
  const planning = useProjectPlanning(projectKey);
  const update = useUpdateTask();
  const now = useNow();
  const [openPicker, setOpenPicker] = useState<OpenPicker>(null);
  const [revealId, setRevealId] = useState<string | null>(null);
  useRevealNewestComment(taskKey, revealNewestComment && settled, setRevealId);
  const milestoneCell = useRef<HTMLDivElement>(null);
  const cycleCell = useRef<HTMLDivElement>(null);
  const statusCell = useRef<HTMLDivElement>(null);
  const priorityCell = useRef<HTMLDivElement>(null);
  const assigneeCell = useRef<HTMLDivElement>(null);
  const createdCell = useRef<HTMLDivElement>(null);
  const { summary, projectName: mirrorProjectName } = useBacklogSummary(projectKey);
  const { note, setNote } = useOwnedFieldNote(update.error, update.reset);

  const task = taskResult.data;
  const shown = task ?? preview;
  const mirror = mirrorOf(shown);
  const isLocked = (field: TaskOwnedField) => mirror.locked.has(field);
  const history = useQuery({
    ...backlogHistoryQuery(projectKey),
    enabled: settled && task?.backlog != null,
  }).data;
  const noteRefs: Record<TaskOwnedField, RefObject<HTMLDivElement | null>> = {
    status: statusCell,
    priority: priorityCell,
    assignee: assigneeCell,
    milestone: milestoneCell,
    createdAt: createdCell,
    title: statusCell,
    description: statusCell,
  };
  const openNote = (field: TaskOwnedField) => {
    setOpenPicker(null);
    setNote({ field });
  };

  useHotkeys({
    'Shift+M':
      shown && planning.usesMilestones
        ? isLocked('milestone')
          ? () => openNote('milestone')
          : () => setOpenPicker('milestone')
        : null,
    'Shift+C': shown && planning.usesCycles ? () => setOpenPicker('cycle') : null,
  });

  const header = (
    <PageHeader>
      <span className="font-mono text-[13px] text-fg">{taskKey}</span>
      {mirror.backlogId ? <BacklogIdTag backlogId={mirror.backlogId} /> : null}
      {showProject && projectName ? <span className="truncate text-muted">in {projectName}</span> : null}
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
  const pickerOpenChange = (picker: Exclude<OpenPicker, null>) => (isOpen: boolean) =>
    setOpenPicker((current) => (isOpen ? picker : current === picker ? null : current));

  // Owned fields of a mirrored task: hatched, "· file" in the caption, and a press opens the note.
  const lockedCell = (field: TaskOwnedField) =>
    isLocked(field)
      ? {
          locked: true,
          dim: mirror.isHidden,
          cellRef: noteRefs[field],
          isActive: note?.field === field,
        }
      : {};
  const cells: PropertyCellProps[] = [
    {
      id: 'status',
      label: 'Status',
      ...lockedCell('status'),
      children: isLocked('status') ? (
        <LockedValue field="status" onOpen={openNote}>
          <StatusSquare status={shown.status} withLabel />
        </LockedValue>
      ) : (
        <StatusPicker value={shown.status} onChange={(status) => save({ status })} />
      ),
    },
    {
      id: 'priority',
      label: 'Priority',
      ...lockedCell('priority'),
      children: isLocked('priority') ? (
        <LockedValue field="priority" onOpen={openNote}>
          <PriorityGlyph priority={shown.priority} withLabel />
        </LockedValue>
      ) : (
        <PriorityPicker value={shown.priority} onChange={(priority) => save({ priority })} />
      ),
    },
    {
      id: 'assignee',
      label: 'Assignee',
      ...lockedCell('assignee'),
      children: isLocked('assignee') ? (
        <LockedValue field="assignee" onOpen={openNote}>
          {shown.assignee ? (
            <AssigneeLabel assignee={shown.assignee} className="min-w-0" />
          ) : (
            <span className="font-normal text-faint">No assignee</span>
          )}
        </LockedValue>
      ) : (
        <AssigneePicker
          value={shown.assignee}
          members={members}
          onChange={(assignee) => save({ assignee })}
        />
      ),
      sub: (task ? extraAssignees(task) : undefined) ?? forLine(shown.assignee),
    },
  ];
  if (planning.usesMilestones && isLocked('milestone')) {
    const backlogMilestone = milestoneBacklogId(shown.milestone, planning.milestones);
    cells.push({
      id: 'milestone',
      label: 'Milestone',
      ...lockedCell('milestone'),
      children: (
        <LockedValue field="milestone" onOpen={openNote}>
          <MilestoneValue value={shown.milestone} milestones={undefined} />
        </LockedValue>
      ),
      sub: backlogMilestone ?? undefined,
    });
  } else if (planning.usesMilestones) {
    cells.push({
      id: 'milestone',
      label: 'Milestone',
      kbd: '⇧M',
      cellRef: milestoneCell,
      isActive: openPicker === 'milestone',
      children: (
        <MilestonePicker
          value={shown.milestone}
          milestones={planning.milestones}
          onChange={(milestone) => save({ milestone })}
          isOpen={openPicker === 'milestone'}
          onOpenChange={pickerOpenChange('milestone')}
          triggerRef={milestoneCell}
        >
          <MilestoneValue value={shown.milestone} milestones={planning.milestones} />
        </MilestonePicker>
      ),
    });
  }
  if (planning.usesCycles) {
    cells.push({
      id: 'cycle',
      label: 'Cycle',
      kbd: '⇧C',
      cellRef: cycleCell,
      isActive: openPicker === 'cycle',
      children: (
        <CyclePicker
          value={shown.cycle}
          cycles={planning.cycles}
          onChange={(cycle) => save({ cycle })}
          isOpen={openPicker === 'cycle'}
          onOpenChange={pickerOpenChange('cycle')}
          triggerRef={cycleCell}
        >
          <CycleValue value={shown.cycle} cycles={planning.cycles} />
        </CyclePicker>
      ),
    });
  }
  cells.push(
    task && isLocked('createdAt')
      ? {
          id: 'created',
          label: 'Created',
          ...lockedCell('createdAt'),
          children: (
            <LockedValue field="createdAt" onOpen={openNote}>
              <MirroredCreated task={task} />
            </LockedValue>
          ),
        }
      : task?.backlog
        ? // Detached or imported: the file's reporter and date, not who set up the mirror.
          { id: 'created', label: 'Created', children: <MirroredCreated task={task} /> }
        : task
          ? {
              id: 'created',
              label: 'Created',
              children: <span className="truncate">{task.createdBy.name}</span>,
              sub: createdSub(task, atTime(formatDay, now)),
            }
          : {
              id: 'created',
              label: 'Created',
              ...lockedCell('createdAt'),
              children: <Skeleton width={70} />,
            },
  );

  return (
    <>
      {header}
      <div className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto px-7 pt-[22px] pb-5">
        {task && mirror.isHidden ? (
          <RemovedBanner task={task} branch={summary?.defaultBranch} />
        ) : task ? (
          <TaskSourceStrip task={task} mirror={mirror} summary={summary} className="-mb-1" />
        ) : null}
        <EditableTitle
          key={`${taskKey}:title`}
          value={shown.title}
          onSave={isLocked('title') ? undefined : (title) => save({ title })}
        />
        {update.isError && !mirroredProblem(update.error) ? (
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
        <PropertyCells cells={cells} />
        <OwnedFieldNote
          field={note?.field ?? null}
          problem={note?.problem}
          task={task}
          milestones={planning.milestones}
          branch={summary?.defaultBranch}
          triggerRef={note ? noteRefs[note.field] : statusCell}
          onClose={() => setNote(null)}
          milestoneShortcut={planning.usesMilestones && isLocked('milestone')}
        />
        {task && isLocked('description') ? (
          <MirroredDescription key={`${taskKey}:description`} source={task.description} />
        ) : task ? (
          <DescriptionSection
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
        {task?.backlog ? <TaskBacklogBlock task={task} projectKey={projectKey} mirror={mirror} /> : null}
        <TaskTimeline
          taskKey={taskKey}
          members={members}
          enabled={settled}
          revealId={revealId}
          projectHistory={task?.backlog ? history : undefined}
          projectName={mirrorProjectName ?? projectKey}
          branch={summary?.defaultBranch}
        />
      </div>
      <div className="shrink-0 border-t border-line bg-bg px-7 pt-3 pb-4">
        <CommentComposer
          taskKey={taskKey}
          members={members}
          onSent={setRevealId}
          placeholder={commentPlaceholder(mirror)}
        />
      </div>
    </>
  );
}

/** Once the timeline has loaded, hands its newest comment to `reveal`, one time per pane. */
function useRevealNewestComment(taskKey: string, enabled: boolean, reveal: (id: string) => void) {
  const newestId = useQuery({
    ...timelineQuery(taskKey),
    enabled,
    select: (data) => data.items.findLast((item) => item.kind === 'comment' && !item.deletedAt)?.id ?? null,
  }).data;
  const done = useRef(false);
  useEffect(() => {
    if (!enabled || done.current || newestId === undefined) return;
    done.current = true;
    if (newestId) reveal(newestId);
  }, [enabled, newestId, reveal]);
}

// ---------------------------------------------------------------------------
// Property cells
// ---------------------------------------------------------------------------

interface PropertyCellProps {
  id: string;
  label: string;
  /** Shortcut drawn after the caption: "⇧M". */
  kbd?: string;
  children: ReactNode;
  /** Muted text after the value; wraps under it when the cell is narrow. */
  sub?: ReactNode;
  /** The picker of this cell is open: focus outline and selection ground. */
  isActive?: boolean;
  cellRef?: RefObject<HTMLDivElement | null>;
  /** Backlog.md owns the value: hatched ground and "· file" after the caption. */
  locked?: boolean;
  /** Faded (a hidden task's owned values). */
  dim?: boolean;
}

/**
 * The bordered property grid: three columns when the pane is wide enough, two otherwise. Cells draw their
 * right and bottom borders; the frame clips the ones on the outer edge.
 */
function PropertyCells({ cells }: { cells: readonly PropertyCellProps[] }) {
  return (
    <div className="@container shrink-0 overflow-hidden border border-line">
      <dl className="-mr-px -mb-px grid grid-cols-2 @min-[520px]:grid-cols-3">
        {cells.map((cell) => (
          <div
            key={cell.id}
            ref={cell.cellRef}
            data-cell={cell.id}
            data-locked={cell.locked || undefined}
            className={cn(
              'flex min-w-0 flex-col gap-[3px] border-r border-b border-line px-2.5 pt-[7px] pb-2',
              cell.locked && lockedHatch,
              cell.isActive && !cell.locked && 'bg-sel',
              cell.isActive && 'outline-2 -outline-offset-2 outline-focus',
            )}
          >
            <dt className={cn('caps flex items-center gap-1.5', cell.dim && 'opacity-60')}>
              {cell.label}
              {cell.locked ? <OwnedFieldCaption /> : null}
              {cell.kbd ? (
                <Kbd aria-hidden className="tracking-normal">
                  {cell.kbd}
                </Kbd>
              ) : null}
            </dt>
            <dd
              className={cn(
                'm-0 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 font-medium',
                cell.dim && 'opacity-60',
              )}
            >
              <span className="flex max-w-full min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap">
                {cell.children}
              </span>
              {cell.sub ? (
                <span className="min-w-0 truncate text-[11.5px] font-normal text-muted">{cell.sub}</span>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Description
// ---------------------------------------------------------------------------

/** Folding the description stays as set while moving between tasks. */
let descriptionOpenChoice = true;

/** "6 lines, 4 checklist items". */
export function describeDescription(source: string): string {
  const lines = source.split('\n').filter((line) => line.trim()).length;
  const checks = findCheckboxes(source).length;
  const parts = [`${lines} ${lines === 1 ? 'line' : 'lines'}`];
  if (checks) parts.push(`${checks} checklist ${checks === 1 ? 'item' : 'items'}`);
  return parts.join(', ');
}

function DescriptionSection({
  value,
  onSave,
}: {
  value: string | null;
  onSave: (description: string | null) => void;
}) {
  const [open, setOpenState] = useState(descriptionOpenChoice);
  const setOpen = (next: boolean) => {
    descriptionOpenChoice = next;
    setOpenState(next);
  };
  if (!value?.trim()) return <EditableDescription value={value} onSave={onSave} />;
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex cursor-pointer items-center gap-2 self-start text-[12.5px] text-muted outline-none hover:text-fg focus-visible:focus-ring"
      >
        <span aria-hidden className="w-2 text-faint">
          {open ? '▾' : '▸'}
        </span>
        <span>Description</span>
        <span className="text-faint">· {describeDescription(value)}</span>
      </button>
      {open ? <EditableDescription value={value} onSave={onSave} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared helpers (also used by the task page and other screens)
// ---------------------------------------------------------------------------

/** Shown where an entry has no actor: the hourly job that ends cycles. */
export const SYSTEM_ACTOR = 'System';

export function toEntry(activity: Activity, format: (value: string) => string): ActivityEntry {
  return {
    id: activity.id,
    // A null actor is the system (the hourly job that ends cycles).
    actor: activity.actor
      ? { name: activity.actor.name, kind: activity.actor.kind }
      : { name: SYSTEM_ACTOR, kind: 'person' },
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
