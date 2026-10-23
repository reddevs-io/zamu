import type { AssigneeRef, DashboardScope, DashboardTask, UserRef } from '@pm/contracts';
import type { KeyboardEvent, ReactNode } from 'react';
import { formatDay, formatRange } from '~/features/planning/dates';
import {
  Avatar,
  CycleGlyph,
  cn,
  MentionChip,
  MilestoneGlyph,
  PriorityGlyph,
  ProgressBar,
  Queue,
  QueueGroupFooter,
  QueueGroupHeader,
  QueueRow,
  Skeleton,
  StatusSquare,
  UnassignedAvatar,
  WarnPill,
} from '~/ui';
import {
  deadlinePill,
  excerptParts,
  headerId,
  openTasksText,
  type QueueEntry,
  type QueueGroupMeta,
  responsibleOf,
  shortAgo,
  silenceAge,
  waitAge,
} from './model';
import type { QueueGroupId } from './search';

// The action queue: four groups in fixed order, each a header line and its rows. Rows are focusable
// (J/K, 1 to 4 move a roving focus) and open a task in the panel or a milestone or cycle page.

export interface QueueGroupView {
  meta: QueueGroupMeta;
  /** Uncapped total from the server (or the matches while searching). */
  total: number;
  rows: QueueEntry[];
  isExpanded: boolean;
  /** Show all is offered (more than 5 and not searching). */
  canExpand: boolean;
}

export interface QueueViewProps {
  /** The scope the shown data belongs to. */
  scope: DashboardScope;
  workspace: string;
  isLoading: boolean;
  groups: readonly QueueGroupView[];
  total: number | undefined;
  /** Nothing in any group: one calm line instead of the groups. */
  isClear: boolean;
  /** "just now", "2m ago". */
  checkedText: string;
  /** grid-template-columns for every row. */
  columns: string;
  /** Full column set (no panel). */
  wide: boolean;
  /** The note is dropped while the panel is open. */
  showNote: boolean;
  focusedId: string | null;
  selectedId: string | null;
  now: number | null;
  /** YYYY-MM-DD of the answer, for years in dates. */
  today: string | undefined;
  /** Member names, to mark @mentions in excerpts. */
  memberNames: readonly string[];
  onFocusRow: (id: string) => void;
  onOpen: (entry: QueueEntry) => void;
  onToggleGroup: (group: QueueGroupId) => void;
}

const MINE_NOTE = 'Assigned to you, your agents, and mentions of you. Items leave when they are handled.';

export function QueueView(props: QueueViewProps) {
  const { scope, workspace, isLoading, groups, isClear, showNote } = props;
  const note = showNote
    ? scope === 'everyone'
      ? `Everyone in ${workspace}. Items leave when they are handled.`
      : MINE_NOTE
    : undefined;
  return (
    <Queue
      title={scope === 'everyone' ? 'Needs someone' : 'Needs you'}
      count={isLoading || isClear ? undefined : props.total}
      note={note}
      aria-busy={isLoading || undefined}
      data-queue
    >
      {isLoading ? (
        <QueueSkeleton columns={props.columns} wide={props.wide} />
      ) : isClear ? (
        <AllClear scope={scope} workspace={workspace} checkedText={props.checkedText} />
      ) : (
        groups.map((group) => <GroupBlock key={group.meta.id} group={group} {...props} />)
      )}
    </Queue>
  );
}

function GroupBlock({ group, ...props }: QueueViewProps & { group: QueueGroupView }) {
  const { meta, total, rows, isExpanded, canExpand } = group;
  const shown = rows.filter((row) => !row.gone).length;
  const showAllLabel = total > 50 ? `Show all 50 of ${total}` : `Show all ${total}`;
  return (
    <div data-queue-group={meta.id}>
      <QueueGroupHeader
        kind={meta.kind}
        label={meta.label}
        count={total}
        emptyText={meta.emptyText}
        isEmpty={rows.length === 0}
        hotkey={meta.hotkey}
        showAll={
          canExpand && !isExpanded
            ? { label: showAllLabel, onPress: () => props.onToggleGroup(meta.id) }
            : undefined
        }
        tabIndex={-1}
        data-row-id={headerId(meta.id)}
        onFocus={() => props.onFocusRow(headerId(meta.id))}
      />
      {rows.map((entry) => (
        <EntryRow key={entry.id} entry={entry} {...props} />
      ))}
      {isExpanded ? (
        <QueueGroupFooter action={{ label: 'Collapse', onPress: () => props.onToggleGroup(meta.id) }}>
          {total > shown
            ? `Showing ${shown} of ${total}. The rest stay here until they clear.`
            : `Showing all ${total}.`}
        </QueueGroupFooter>
      ) : null}
    </div>
  );
}

function EntryRow({ entry, ...props }: QueueViewProps & { entry: QueueEntry }) {
  const { columns, focusedId, selectedId, onFocusRow, onOpen } = props;
  const isFocused = focusedId === entry.id;
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onOpen(entry);
    }
  };
  return (
    <QueueRow
      role={entry.group === 'deadlines' ? 'link' : 'button'}
      aria-label={rowLabel(entry)}
      aria-current={selectedId === entry.id ? 'true' : undefined}
      tabIndex={isFocused || (focusedId == null && isFirstRow(entry, props.groups)) ? 0 : -1}
      columns={columns}
      twoLine={entry.group === 'mentions'}
      isSelected={selectedId === entry.id}
      data-row-id={entry.id}
      data-gone={entry.gone || undefined}
      className={cn('cursor-pointer', entry.gone && 'opacity-50')}
      onFocus={() => onFocusRow(entry.id)}
      onClick={() => onOpen(entry)}
      onKeyDown={onKeyDown}
    >
      <EntryCells entry={entry} {...props} />
    </QueueRow>
  );
}

function isFirstRow(entry: QueueEntry, groups: readonly QueueGroupView[]) {
  for (const group of groups) {
    const first = group.rows[0];
    if (first) return first.id === entry.id;
  }
  return false;
}

/** Accessible name: what the row is and why it is here. */
function rowLabel(entry: QueueEntry): string {
  switch (entry.group) {
    case 'review':
      return `${entry.item.task.key} ${entry.item.task.title}, in review`;
    case 'stalled':
      return `${entry.item.task.key} ${entry.item.task.title}, stalled`;
    case 'mentions':
      return `${entry.item.author.name} on ${entry.item.task.key} ${entry.item.task.title}: ${entry.item.comment.excerpt}`;
    case 'deadlines': {
      const item = entry.item;
      const name = item.kind === 'milestone' ? item.milestone.name : `Cycle ${item.cycle.number}`;
      return `${item.project.key} ${name}, ${deadlinePill(item)}`;
    }
  }
}

function EntryCells({ entry, wide, now, today, scope, memberNames }: QueueViewProps & { entry: QueueEntry }) {
  switch (entry.group) {
    case 'review':
    case 'stalled': {
      const { task, assignee } = entry.item;
      const meta =
        entry.group === 'review' ? (
          <span>{now != null ? `in review ${waitAge(entry.item.since, now)}` : ''}</span>
        ) : now != null ? (
          <WarnPill>{`no update ${silenceAge(entry.item.lastTouchedAt, now)}`}</WarnPill>
        ) : null;
      return (
        <>
          <StatusSquare status={task.status} />
          <Key>{task.key}</Key>
          <span className="truncate">{task.title}</span>
          {wide ? (
            <>
              <ProjectCell task={task} />
              <Who user={assignee} />
              <PriorityGlyph priority={task.priority} />
            </>
          ) : null}
          <Meta>{meta}</Meta>
        </>
      );
    }
    case 'mentions': {
      const { task, author, onBehalfOf, mentioned, comment } = entry.item;
      return (
        <>
          <Avatar name={author.name} kind={author.kind} decorative />
          <Key>{task.key}</Key>
          <span className="flex min-w-0 flex-col gap-[3px]">
            <span className="flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap">
              <b className="shrink-0 font-semibold">{author.name}</b>
              {onBehalfOf ? (
                <span className="shrink-0 text-[11.5px] text-muted">for {onBehalfOf.name}</span>
              ) : null}
              {scope === 'everyone' ? (
                <>
                  <span aria-hidden className="text-faint">
                    →
                  </span>
                  <b className="shrink-0 font-semibold">{mentioned.name}</b>
                </>
              ) : null}
              <span className="text-faint">on</span>
              <span className="truncate text-muted">{task.title}</span>
            </span>
            <Excerpt text={comment.excerpt} names={[mentioned.name, ...memberNames]} />
          </span>
          {wide ? (
            <>
              <ProjectCell task={task} />
              <span className="text-[12px] text-faint">
                {author.kind === 'agent' ? 'Agent asks' : 'Person asks'}
              </span>
              <PriorityGlyph priority={task.priority} />
            </>
          ) : null}
          <Meta>{now != null ? shortAgo(comment.createdAt, now) : ''}</Meta>
        </>
      );
    }
    case 'deadlines': {
      const item = entry.item;
      const progress = item.progress;
      const share = progress.total > 0 ? progress.done / progress.total : 0;
      const title = item.kind === 'milestone' ? item.milestone.name : cycleTitle(item.cycle);
      const sub =
        item.kind === 'milestone'
          ? `milestone · target ${formatDay(item.milestone.targetDate, today)}`
          : `cycle · ${formatRange(item.cycle.startsOn, item.cycle.endsOn, today)}`;
      return (
        <>
          {item.kind === 'milestone' ? (
            <MilestoneGlyph filled className="ml-[3px] text-warn" />
          ) : (
            <CycleGlyph state="progress" progress={share} className="ml-0.5 text-warn" />
          )}
          <Key>{item.project.key}</Key>
          <span className="flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap">
            <b className="truncate font-semibold">{title}</b>
            <span className="shrink-0 text-[12px] text-faint">{sub}</span>
          </span>
          {wide ? (
            <>
              <ProgressBar
                done={progress.done}
                total={progress.total}
                showCount
                label={`${title} progress`}
                className="gap-1.5"
              />
              <span className="text-[12px] text-muted">{openTasksText(item.openTasks)}</span>
              <span />
            </>
          ) : null}
          <Meta>
            <WarnPill>{deadlinePill(item)}</WarnPill>
          </Meta>
        </>
      );
    }
  }
}

/** "Cycle 4", or "Cycle 4 · Checkout rewrite" when it has a name. */
export function cycleTitle(cycle: { number: number; name: string | null }): string {
  return cycle.name ? `Cycle ${cycle.number} · ${cycle.name}` : `Cycle ${cycle.number}`;
}

function Key({ children }: { children: ReactNode }) {
  return <span className="font-mono text-[10.5px] whitespace-nowrap text-muted">{children}</span>;
}

function Meta({ children }: { children: ReactNode }) {
  return (
    <span className="flex items-center justify-end gap-1.5 font-mono text-[10px] whitespace-nowrap text-faint">
      {children}
    </span>
  );
}

function ProjectCell({ task }: { task: DashboardTask }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <ProjectBadge>{task.project.key}</ProjectBadge>
      <span className="truncate text-[12px] text-muted">{task.project.name}</span>
    </span>
  );
}

export function ProjectBadge({ children }: { children: ReactNode }) {
  return (
    <span className="shrink-0 border border-line px-1 font-mono text-[9.5px] leading-[15px] text-muted">
      {children}
    </span>
  );
}

/** Avatar, name, and "for Ana Ruiz" after an agent; "Unassigned" without anyone. */
export function Who({ user }: { user: AssigneeRef | (UserRef & { responsible?: UserRef | null }) | null }) {
  if (!user) {
    return (
      <span className="flex min-w-0 items-center gap-1.5 text-[12px] whitespace-nowrap text-faint">
        <UnassignedAvatar decorative />
        Unassigned
      </span>
    );
  }
  const forName = responsibleOf({ kind: user.kind, responsible: user.responsible ?? null });
  return (
    <span className="flex min-w-0 items-center gap-1.5 overflow-hidden text-[12px] whitespace-nowrap text-muted">
      <Avatar name={user.name} kind={user.kind} decorative />
      <span className="truncate text-fg">{user.name}</span>
      {forName ? <span className="truncate text-[11.5px]">for {forName}</span> : null}
    </span>
  );
}

function Excerpt({ text, names }: { text: string; names: readonly string[] }) {
  return (
    <span className="min-w-0 truncate text-[12.5px] text-muted">
      {excerptParts(text, names).map((part, index) => {
        const key = `${index}:${part.type}`;
        if (part.type === 'mention') return <MentionChip key={key} name={part.value} />;
        if (part.type === 'code') {
          return (
            <code key={key} className="bg-band px-[3px] font-mono text-[11px] text-fg">
              {part.value}
            </code>
          );
        }
        return <span key={key}>{part.value}</span>;
      })}
    </span>
  );
}

function AllClear({
  scope,
  workspace,
  checkedText,
}: {
  scope: DashboardScope;
  workspace: string;
  checkedText: string;
}) {
  const checked = checkedText ? ` Checked ${checkedText}.` : '';
  return (
    <div data-all-clear className="flex items-center gap-3.5 px-4 py-[18px]">
      <span aria-hidden className="relative size-[22px] shrink-0 border-[1.5px] border-done">
        <span className="absolute top-0.5 left-1.5 h-2.5 w-[5px] rotate-45 border-r-2 border-b-2 border-done" />
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <b className="text-[13.5px] font-semibold">
          {scope === 'everyone' ? 'Nothing needs anyone right now' : 'Nothing needs you right now'}
        </b>
        <span className="text-muted">
          {scope === 'everyone'
            ? `Reviews, mentions, stalled work and deadlines across ${workspace} land here.${checked}`
            : `Reviews, mentions, stalled work and deadlines for you and your agents land here.${checked}`}
        </span>
      </div>
    </div>
  );
}

const SKELETON_GROUPS = [70, 60, 56];
const SKELETON_ROWS = ['64%', '48%'];

function QueueSkeleton({ columns, wide }: { columns: string; wide: boolean }) {
  return (
    <>
      {SKELETON_GROUPS.map((width) => (
        <div key={width} aria-hidden>
          <div className="flex h-[30px] items-center gap-2.5 border-b border-line-2 bg-band px-4">
            <Skeleton width={8} />
            <Skeleton width={width} />
          </div>
          {SKELETON_ROWS.map((title) => (
            <div
              key={title}
              style={{ gridTemplateColumns: columns }}
              className="grid min-h-9 items-center gap-3 border-b border-line-2 px-4"
            >
              <Skeleton width={8} />
              <Skeleton width={48} />
              <Skeleton width={title} />
              {wide ? (
                <>
                  <Skeleton width={80} />
                  <Skeleton width={120} />
                  <Skeleton width={20} />
                </>
              ) : null}
              <Skeleton width={60} className="justify-self-end" />
            </div>
          ))}
        </div>
      ))}
    </>
  );
}
