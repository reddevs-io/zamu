import type {
  BacklogBlockView,
  BacklogTaskLink,
  MilestoneWithProgress,
  ProjectBacklogSummary,
  Task,
  TaskOwnedField,
} from '@pm/contracts';
import { useQuery } from '@tanstack/react-query';
import { type ReactNode, type RefObject, useState } from 'react';
import { orpc } from '~/lib/orpc';
import {
  Avatar,
  BacklogBlock,
  Button,
  buttonStyles,
  cn,
  Dialog,
  InlineCode,
  KeyValueRow,
  LabelChip,
  MissingTaskLink,
  NoneGlyph,
  Popover,
  SourceStatusDot,
  SourceStrip,
  TaskLink,
  useCopy,
} from '~/ui';
import { useNow } from './clock';
import { atTime, formatDay } from './format';
import { Markdown } from './Markdown';
import {
  describeBuiltFrom,
  describeMirroredDescription,
  detachedLead,
  editExample,
  type MirrorInfo,
  OWNED_FIELD_LABELS,
  OWNED_FIELD_SOURCE,
} from './mirror';
import { projectsQuery, timelineQuery } from './queries';

// Pieces of a task mirrored from (or once imported from) Backlog.md, shared by the detail pane and the
// task page: the Backlog.md ID tag, the source strip, the removed banner, the owned-field note, the
// read-only description and the Backlog.md block (frames 5a to 5k).

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The project's Backlog.md summary and name, from the cached project list. */
export function useBacklogSummary(projectKey: string): {
  summary: ProjectBacklogSummary | null;
  projectName: string | undefined;
} {
  const project = useQuery({
    ...projectsQuery(),
    select: (data) => data.items.find((item) => item.key === projectKey),
  }).data;
  return { summary: project?.backlog ?? null, projectName: project?.name };
}

/** Project-level Backlog.md history (first read, detach), for tasks that came from Backlog.md. */
export function backlogHistoryQuery(projectKey: string) {
  return orpc.backlog.status.queryOptions({
    input: { project: projectKey, problemsLimit: 1 },
    retry: false,
    staleTime: 60_000,
    select: (data) => data.history,
  });
}

/** "BACK-786" next to the task key in the header. */
export function BacklogIdTag({ backlogId }: { backlogId: string }) {
  return (
    <span
      title="Backlog.md ID"
      className="inline-flex h-5 shrink-0 items-center border border-line px-1.5 font-mono text-[10.5px] font-medium text-muted"
    >
      {backlogId}
    </span>
  );
}

/**
 * Strip above the title: "Fields with a hatch come from <file> · Open file", or after detach "Was
 * mirrored from <file> · View file".
 */
export function TaskSourceStrip({
  task,
  mirror,
  summary,
  className,
}: {
  task: Task;
  mirror: MirrorInfo;
  summary: ProjectBacklogSummary | null;
  className?: string;
}) {
  const backlog = task.backlog;
  if (!backlog || mirror.isHidden) return null;
  const lead = mirror.isDetached ? detachedLead(summary) : 'Fields with a hatch come from';
  const label = mirror.isDetached ? 'View file' : 'Open file';
  return (
    <SourceStrip
      className={className}
      lead={backlog.file ? lead : `${lead} Backlog.md as`}
      path={backlog.file ?? backlog.id}
      link={backlog.fileUrl ? { label, href: backlog.fileUrl } : undefined}
    />
  );
}

/** Banner on a hidden task opened by URL (frame 5i). */
export function RemovedBanner({
  task,
  branch,
  className,
}: {
  task: Task;
  branch: string | null | undefined;
  className?: string;
}) {
  const now = useNow();
  const commit = useQuery({
    ...timelineQuery(task.key),
    select: (data) => {
      const hides = data.items.filter((item) => item.kind === 'activity' && item.type === 'task.hidden');
      const last = hides[hides.length - 1];
      return last?.kind === 'activity' ? (last.originRef ?? null) : null;
    },
  }).data;
  const day = task.hiddenAt ? atTime(formatDay, now)(task.hiddenAt) : '';
  return (
    <div
      role="status"
      className={cn(
        'flex shrink-0 items-start gap-2.5 border border-line bg-band px-3.5 py-2.5 text-[12.5px] leading-[1.55] text-muted [&_b]:font-semibold [&_b]:text-fg',
        className,
      )}
    >
      <SourceStatusDot state="paused" decorative className="mt-[5px]" />
      <span>
        <b>Removed from Backlog.md{day ? ` on ${day}` : ''}.</b> Its file is no longer on{' '}
        <span className="font-mono text-[11px] text-fg">{branch ?? 'the default branch'}</span>
        {commit ? ` (last seen at commit ${commit.slice(0, 7)})` : ''}, so the task is hidden from lists, the
        board and My tasks. The comments stay. If the file comes back, so does the task.
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Owned-field note
// ---------------------------------------------------------------------------

export interface OwnedFieldNoteProps {
  field: TaskOwnedField | null;
  task: Task | undefined;
  milestones?: readonly MilestoneWithProgress[];
  branch: string | null | undefined;
  /** The cell the note hangs from. */
  triggerRef: RefObject<Element | null>;
  onClose: () => void;
  /** Whether ⇧M opens the note for the milestone (the project uses milestones and it is locked). */
  milestoneShortcut: boolean;
  /** From a refused write (409 TASK_MIRRORED): the server's command and file win over the example. */
  problem?: { hint?: string; file?: string; message?: string } | null;
  placement?: 'bottom start' | 'bottom end' | 'left top';
}

/**
 * "Status comes from Backlog.md": where to change the value, an example backlog command, Copy path and
 * Open file. Opens on a click on a hatched field, or ⇧M for the milestone.
 */
export function OwnedFieldNote({
  field,
  task,
  milestones,
  branch,
  triggerRef,
  onClose,
  milestoneShortcut,
  problem,
  placement = 'bottom start',
}: OwnedFieldNoteProps) {
  const { copied, copy } = useCopy();
  const isOpen = field != null && task?.backlog != null;
  if (!isOpen || !field || !task?.backlog) return null;
  const label = OWNED_FIELD_LABELS[field];
  const command = problem?.hint ?? editExample(task, field, milestones);
  const file = problem?.file ?? task.backlog.file;
  const fileUrl = task.backlog.fileUrl;
  const opener =
    field === 'milestone'
      ? milestoneShortcut
        ? 'Opened by clicking Milestone, or with ⇧M.'
        : 'Opened by clicking Milestone.'
      : milestoneShortcut
        ? `Opened by clicking ${label}. ⇧M on Milestone does the same.`
        : `Opened by clicking ${label}.`;
  return (
    <Popover
      triggerRef={triggerRef}
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      placement={placement}
      className="w-[380px] min-w-0"
    >
      <Dialog aria-label={`${label} comes from Backlog.md`} className="flex-none">
        <div className="flex flex-col gap-2 px-3.5 py-3 leading-normal">
          <b className="font-semibold">{label} comes from Backlog.md</b>
          {problem?.message ? (
            <span role="alert" className="text-[12.5px] text-danger">
              {problem.message}.
            </span>
          ) : null}
          <span className="text-[12.5px] text-muted">
            Change <InlineCode>{OWNED_FIELD_SOURCE[field]}</InlineCode> in the task file on{' '}
            <span className="font-mono text-[11px] text-fg">{branch ?? 'the default branch'}</span>, or ask an
            agent to. The task updates on the next refresh.
          </span>
          {command ? (
            <code className="block border border-line-2 bg-band px-2.5 py-2 font-mono text-[11.5px] break-words whitespace-normal text-fg">
              {command}
            </code>
          ) : null}
          <span className="text-[11.5px] text-faint">
            pm and the API refuse the change with the same explanation (409, task_mirrored).
          </span>
        </div>
        <div className="flex items-center gap-2 border-t border-line-2 bg-band px-3.5 py-2">
          <span className="min-w-0 flex-1 text-[11.5px] text-faint">{opener}</span>
          {file ? (
            <Button variant="secondary" size="sm" onPress={() => copy(file)}>
              {copied ? 'Copied' : 'Copy path'}
            </Button>
          ) : null}
          {fileUrl ? (
            <a
              href={fileUrl}
              target="_blank"
              rel="noreferrer"
              className={buttonStyles({ variant: 'primary', size: 'sm' })}
            >
              Open file
            </a>
          ) : null}
        </div>
      </Dialog>
    </Popover>
  );
}

/**
 * A locked property value: pressing it opens the owned-field note. Reads as the value, not as a
 * control; the accessible name says where the value comes from.
 */
export function LockedValue({
  field,
  onOpen,
  children,
}: {
  field: TaskOwnedField;
  onOpen: (field: TaskOwnedField) => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      onClick={() => onOpen(field)}
      className="-mx-1 flex max-w-[calc(100%+8px)] min-w-0 cursor-pointer items-center gap-1.5 px-1 text-left text-[13px] font-medium text-fg outline-none focus-visible:focus-ring"
    >
      {children}
      <span className="sr-only">, from Backlog.md</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Description and the Backlog.md block
// ---------------------------------------------------------------------------

/** Folding the mirrored description stays as set while moving between tasks; folded at first. */
let mirroredDescriptionOpen = false;

/** Read-only description built from the Backlog.md sections, folded by default (frames 5a, 5d). */
export function MirroredDescription({
  source,
  size = 'pane',
}: {
  source: string | null;
  size?: 'pane' | 'page';
}) {
  const [open, setOpenState] = useState(size === 'page' ? true : mirroredDescriptionOpen);
  const setOpen = (next: boolean) => {
    if (size === 'pane') mirroredDescriptionOpen = next;
    setOpenState(next);
  };
  const empty = !source?.trim();
  return (
    <div className="flex shrink-0 flex-col gap-2">
      <button
        type="button"
        aria-expanded={empty ? undefined : open}
        disabled={empty}
        onClick={() => setOpen(!open)}
        className="flex cursor-pointer items-center gap-2 self-start text-[12.5px] text-muted outline-none hover:text-fg focus-visible:focus-ring disabled:cursor-default disabled:hover:text-muted"
      >
        <span aria-hidden className="w-2 text-faint">
          {open && !empty ? '▾' : '▸'}
        </span>
        <span className={cn(open && !empty && 'font-semibold text-fg')}>Description</span>
        <span className="text-faint">
          · {open && !empty ? describeBuiltFrom(source) : describeMirroredDescription(source)}
        </span>
      </button>
      {open && source && !empty ? (
        <div className={cn('border border-line-2 px-3.5 py-3', size === 'page' && 'max-w-[720px]')}>
          <Markdown source={source} size={size} variant="backlog" className="max-w-none" />
        </div>
      ) : null}
    </div>
  );
}

const taskHref = (projectKey: string, key: string) => `/p/${projectKey}/${key}`;

function LinkedTask({ link, projectKey }: { link: BacklogTaskLink; projectKey: string }) {
  if (!link.task) return <MissingTaskLink backlogId={link.id} />;
  return (
    <TaskLink
      taskKey={link.task.key}
      title={link.task.hidden ? `${link.task.title} (removed from Backlog.md)` : link.task.title}
      status={link.task.status}
      href={taskHref(projectKey, link.task.key)}
    />
  );
}

/** "Nov 14, 2026" for a YYYY-MM-DD due date; anything else as written. */
export function formatDueDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  const [, year, month, day] = match;
  return `${MONTHS[Number(month) - 1] ?? month} ${Number(day)}, ${year}`;
}

function otherValue(value: unknown): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

const isUrl = (value: string) => /^https?:\/\//i.test(value);

function PathList({ values }: { values: readonly string[] }) {
  return values.map((value) =>
    isUrl(value) ? (
      <a
        key={value}
        href={value}
        target="_blank"
        rel="noreferrer"
        title={value}
        className="truncate font-mono text-[11px] text-fg outline-none hover:underline focus-visible:focus-ring"
      >
        {value}
      </a>
    ) : (
      <span key={value} title={value} className="truncate font-mono text-[11px]">
        {value}
      </span>
    ),
  );
}

/** The Backlog.md fields this app has no column for, read-only (frames 5a, 5h, 5k). */
export function TaskBacklogBlock({
  task,
  projectKey,
  mirror,
  className,
}: {
  task: Task;
  projectKey: string;
  mirror: MirrorInfo;
  className?: string;
}) {
  const backlog = task.backlog;
  if (!backlog) return null;
  const data: BacklogBlockView = backlog.data;
  const shownAssignee = task.assignee?.id;
  // The first value that maps to the task's assignee is shown in the grid; the rest are "also assigned".
  const firstMatch = data.assignees.findIndex((value) => value.user && value.user.id === shownAssignee);
  const also = data.assignees.filter((_value, index) => index !== firstMatch);
  const other = Object.entries(data.other);
  const dueType = [data.dueDate ? formatDueDate(data.dueDate) : null, data.type].filter(Boolean);
  return (
    <BacklogBlock
      backlogId={backlog.id}
      className={className}
      note={
        mirror.isDetached ? 'kept from the import · read-only' : 'read-only · fields this app doesn’t have'
      }
    >
      {data.labels.length ? (
        <KeyValueRow label="Labels">
          {data.labels.map((label) => (
            <LabelChip key={label}>{label}</LabelChip>
          ))}
        </KeyValueRow>
      ) : null}
      {also.length ? (
        <KeyValueRow label="Also assigned">
          {also.map((value, index) => (
            <span key={value.value} className="inline-flex min-w-0 items-center gap-1.5">
              {index > 0 ? (
                <span aria-hidden className="text-faint">
                  ·
                </span>
              ) : null}
              {value.user ? (
                <>
                  <Avatar name={value.user.name} kind={value.user.kind} decorative />
                  <span className="text-fg">{value.value}</span>
                  <span className="text-faint">is {value.user.name}</span>
                </>
              ) : (
                <>
                  <NoneGlyph shape="circle" size={18} />
                  <span>{value.value}</span>
                  <span className="text-faint">matches no member</span>
                </>
              )}
            </span>
          ))}
        </KeyValueRow>
      ) : null}
      {data.parent ? (
        <KeyValueRow label="Parent" layout="stack">
          <LinkedTask link={data.parent} projectKey={projectKey} />
        </KeyValueRow>
      ) : null}
      {data.dependencies.length ? (
        <KeyValueRow label="Depends on" layout="stack">
          {data.dependencies.map((link) => (
            <LinkedTask key={link.id} link={link} projectKey={projectKey} />
          ))}
        </KeyValueRow>
      ) : null}
      {data.subtasks.length ? (
        <KeyValueRow label="Subtasks" layout="stack">
          {data.subtasks.map((link) => (
            <LinkedTask key={link.id} link={link} projectKey={projectKey} />
          ))}
        </KeyValueRow>
      ) : null}
      {dueType.length ? (
        <KeyValueRow label="Due · type" layout="plain">
          {data.dueDate ? formatDueDate(data.dueDate) : 'no due date'}
          {data.type ? ` · ${data.type}` : ''}
        </KeyValueRow>
      ) : null}
      {data.references.length ? (
        <KeyValueRow label="References" layout="stack">
          <PathList values={data.references} />
        </KeyValueRow>
      ) : null}
      {data.documentation.length ? (
        <KeyValueRow label="Documentation" layout="stack">
          <PathList values={data.documentation} />
        </KeyValueRow>
      ) : null}
      {data.modifiedFiles.length ? (
        <KeyValueRow label="Modified files" layout="stack">
          <PathList values={data.modifiedFiles} />
        </KeyValueRow>
      ) : null}
      {other.length ? (
        <KeyValueRow label="Other fields">
          {other.map(([key, value], index) => (
            <span key={key} className="inline-flex min-w-0 items-center gap-1.5">
              {index > 0 ? (
                <span aria-hidden className="text-faint">
                  ·
                </span>
              ) : null}
              <span className="font-mono text-[11px]">
                {key}: {otherValue(value)}
              </span>
            </span>
          ))}
        </KeyValueRow>
      ) : null}
      {!data.labels.length &&
      !also.length &&
      !data.parent &&
      !data.dependencies.length &&
      !data.subtasks.length &&
      !dueType.length &&
      !data.references.length &&
      !data.documentation.length &&
      !data.modifiedFiles.length &&
      !other.length ? (
        <KeyValueRow label="Fields">
          <span className="text-faint">No other fields in the file.</span>
        </KeyValueRow>
      ) : null}
    </BacklogBlock>
  );
}

// ---------------------------------------------------------------------------
// Property values that differ for mirrored tasks
// ---------------------------------------------------------------------------

/** "Oct 2, 09:14 UTC": Backlog.md dates carry no zone and mean UTC. */
export function formatUtcDayTime(value: string | Date, now: Date = new Date()): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  const day = `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`;
  const withYear = date.getUTCFullYear() === now.getUTCFullYear() ? day : `${day}, ${date.getUTCFullYear()}`;
  const time = `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`;
  return `${withYear}, ${time} UTC`;
}

/** "+1 in Backlog.md": assignee values the grid does not show. */
export function extraAssignees(task: Task | undefined): string | undefined {
  const values = task?.backlog?.data.assignees ?? [];
  if (!values.length) return undefined;
  const shown = task?.assignee ? values.some((value) => value.user?.id === task.assignee?.id) : false;
  const extra = values.length - (shown ? 1 : 0);
  return extra > 0 ? `+${extra} in Backlog.md` : undefined;
}

/** Created of a mirrored task: the reporter from the file and its created date in UTC. */
export function MirroredCreated({ task }: { task: Task }) {
  const now = useNow();
  const when = atTime(formatUtcDayTime, now)(task.createdAt);
  const reporter = task.backlog?.data.reporter;
  return (
    <>
      <span className="truncate">{reporter ?? when}</span>
      {reporter && when ? (
        <span className="shrink-0 text-[11.5px] font-normal text-muted">{when}</span>
      ) : null}
    </>
  );
}
