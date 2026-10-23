import type { HTMLAttributes, ReactNode } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { Avatar, type MemberKind } from './Avatar';
import { Chip } from './Chip';
import { cn, tv } from './cn';
import { type Priority, STATUS_LABELS, type TaskStatus } from './meta';
import { CycleGlyph, type CycleGlyphState, MilestoneGlyph } from './PlanningGlyph';
import { PriorityGlyph } from './PriorityGlyph';
import { Skeleton } from './Skeleton';
import { StatusSquare } from './StatusSquare';

/* Visual pieces of the board. Drag and drop wiring (React Aria useDragAndDrop) lives in the board feature;
   these components only draw the states. */

// ── Card ────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Card frame. `state` forces a look (gallery, drag preview). Without it the card follows React Aria
 * data attributes when used as a GridListItem className: data-hovered, data-focus-visible,
 * data-selected, and data-dragging (the source slot turns into the dashed ghost).
 */
export const boardCardStyles = tv({
  base: [
    'relative box-border flex shrink-0 flex-col gap-1.5 border px-2.5 pt-2 pb-[9px] outline-none',
    'cursor-pointer border-line bg-surface text-fg',
    'hover:border-muted',
    'focus-visible:border-focus focus-visible:shadow-[0_0_0_2px_var(--focus)]',
    'selected:border-accent selected:bg-sel',
    'dragging:border-dashed dragging:border-line dragging:bg-transparent dragging:shadow-none dragging:*:invisible',
  ],
  variants: {
    state: {
      default: '',
      hover: 'border-muted',
      focus: 'border-focus shadow-[0_0_0_2px_var(--focus)]',
      selected: 'border-accent bg-sel',
      /** The floating preview under the pointer. */
      dragging: 'z-[5] -rotate-[1.5deg] border-accent shadow-dialog',
      /** The empty slot the dragged card left behind. */
      ghost: 'h-16 border-dashed border-line bg-transparent *:invisible',
    },
  },
});

export type BoardCardState = 'default' | 'hover' | 'focus' | 'selected' | 'dragging' | 'ghost';

export interface BoardCardMember {
  name: string;
  kind: MemberKind;
  hue?: number;
  initials?: string;
}

export interface BoardCardContentProps {
  /** "PAY-142". */
  taskKey: string;
  title: string;
  /** Priority glyph at the top right. Omitted when unset. */
  priority?: Priority | number;
  /** Milestone chip. `filled` for active and completed milestones. */
  milestone?: { name: string; filled?: boolean } | null;
  /** Cycle chip: "C12". */
  cycle?: { label: string; state?: CycleGlyphState; progress?: number } | null;
  /** Avatar at the bottom right. Nothing is drawn when unassigned. */
  assignee?: BoardCardMember | null;
}

/** Inside of a card: key and priority, title clamped at 2 lines, milestone and cycle chips, assignee. */
export function BoardCardContent({
  taskKey,
  title,
  priority,
  milestone,
  cycle,
  assignee,
}: BoardCardContentProps) {
  const hasFooter = Boolean(milestone || cycle || assignee);
  return (
    <>
      <div className="flex min-w-0 items-center gap-2">
        <span className="font-mono text-[10.5px] text-muted">{taskKey}</span>
        <span className="flex-1" />
        {priority != null ? <PriorityGlyph priority={priority} /> : null}
      </div>
      <div className="line-clamp-2 text-[12.5px] leading-[1.38] font-medium text-pretty">{title}</div>
      {hasFooter ? (
        <div className="flex min-w-0 items-center gap-[5px]">
          {milestone ? (
            <Chip glyph={<MilestoneGlyph filled={milestone.filled} />} className="shrink">
              {milestone.name}
            </Chip>
          ) : null}
          {cycle ? (
            <Chip glyph={<CycleGlyph state={cycle.state} progress={cycle.progress} />} className="shrink-0">
              {cycle.label}
            </Chip>
          ) : null}
          <span className="flex-1" />
          {assignee ? (
            <span title={assignee.name} className="flex shrink-0">
              <Avatar {...assignee} />
            </span>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

export interface BoardCardProps
  extends BoardCardContentProps,
    Omit<HTMLAttributes<HTMLDivElement>, 'title' | 'children'> {
  /** Forced look; leave unset to follow hover and focus. */
  state?: BoardCardState;
}

/** Static card: a div with the card frame and content. For drag and drop use boardCardStyles on a GridListItem. */
export function BoardCard({
  state = 'default',
  taskKey,
  title,
  priority,
  milestone,
  cycle,
  assignee,
  className,
  ...props
}: BoardCardProps) {
  return (
    <div {...props} data-card-state={state} className={cn(boardCardStyles({ state }), className)}>
      <BoardCardContent
        taskKey={taskKey}
        title={title}
        priority={priority}
        milestone={milestone}
        cycle={cycle}
        assignee={assignee}
      />
    </div>
  );
}

/** Dashed empty slot left where a card was picked up. */
export function BoardCardGhost({ className }: { className?: string }) {
  return <div aria-hidden className={cn(boardCardStyles({ state: 'ghost' }), className)} />;
}

/** Loading placeholder for one card. */
export function BoardCardSkeleton({ titleWidth = '70%' }: { titleWidth?: string | number }) {
  return (
    <div aria-hidden className="box-border flex h-16 shrink-0 flex-col gap-2 border border-line-2 p-2.5">
      <Skeleton width={46} />
      <Skeleton width={titleWidth} />
    </div>
  );
}

/** Classes for the insertion line. Use on a React Aria DropIndicator: visible only while it is the target. */
export const dropIndicatorClass = 'relative -my-0.5 h-0.5 shrink-0 bg-transparent drop-target:bg-drop-line';

/** 2px --drop-line insertion line between cards. */
export function DropLine({ className }: { className?: string }) {
  return <div aria-hidden className={cn('-my-0.5 h-0.5 shrink-0 bg-drop-line', className)} />;
}

// ── Columns ─────────────────────────────────────────────────────────────────────────────────────────

const columnCaption = 'text-[11px] font-semibold tracking-[0.06em] uppercase';

export interface BoardColumnHeaderProps {
  status: TaskStatus;
  /** Defaults to the status name. */
  label?: string;
  count: number;
  /** Shows the "+" button: new task in this status. */
  onAdd?: () => void;
  /** Makes the title a button that folds the column. */
  onFold?: () => void;
  className?: string;
}

/** 34px column header: status square, caps name, count, "+". Also used alone above swimlanes. */
export function BoardColumnHeader({
  status,
  label,
  count,
  onAdd,
  onFold,
  className,
}: BoardColumnHeaderProps) {
  const name = label ?? STATUS_LABELS[status];
  const title = (
    <>
      <StatusSquare status={status} />
      <span>{name}</span>
      <span className="font-mono text-[10px] font-normal tracking-normal text-faint">{count}</span>
    </>
  );
  return (
    <div
      className={cn(
        'flex h-[34px] shrink-0 items-center gap-2 border-b border-line-2 px-3 whitespace-nowrap',
        columnCaption,
        className,
      )}
    >
      {onFold ? (
        <AriaButton
          onPress={onFold}
          aria-expanded
          aria-label={`Fold ${name}, ${count} tasks`}
          className="flex cursor-pointer items-center gap-2 uppercase outline-none focus-visible:focus-ring"
        >
          {title}
        </AriaButton>
      ) : (
        <span className="flex items-center gap-2">{title}</span>
      )}
      <span className="flex-1" />
      {onAdd ? (
        <AriaButton
          onPress={onAdd}
          aria-label={`New task in ${name}`}
          className="cursor-pointer px-1 text-[13px] font-normal tracking-normal text-faint outline-none hover:text-fg focus-visible:focus-ring"
        >
          +
        </AriaButton>
      ) : null}
    </div>
  );
}

export interface BoardColumnProps {
  status: TaskStatus;
  /** Defaults to the status name. */
  label?: string;
  /** Tasks in the column, including those not loaded yet. */
  count: number;
  /** Folded columns are a 40px strip with a vertical title. */
  isFolded?: boolean;
  /** Called with the next folded state: from the folded strip (expand) or the header title (fold). */
  onFoldChange?: (folded: boolean) => void;
  /** A dragged card is over this column: --drop ground and dashed --drop-line outline. */
  isDropTarget?: boolean;
  /**
   * The column refuses the dragged card (a mirrored task cannot change status): hatched ground, cards at
   * half strength and a band under the header. `true` draws the default ColumnRefusal text; a string
   * replaces the text; any other node is drawn as the band.
   */
  refusal?: ReactNode;
  /** "+" in the header. */
  onAdd?: () => void;
  /** Dashed footer under the cards: "49 more · scroll or press J". */
  more?: ReactNode;
  /** Cards (or the GridList holding them). Ignored while folded. */
  children?: ReactNode;
  className?: string;
}

/** One status column. Open: header plus a scrolling body. Folded: 40px strip. */
export function BoardColumn({
  status,
  label,
  count,
  isFolded = false,
  onFoldChange,
  isDropTarget = false,
  refusal,
  onAdd,
  more,
  children,
  className,
}: BoardColumnProps) {
  const name = label ?? STATUS_LABELS[status];
  if (isFolded) {
    const strip = (
      <>
        <StatusSquare status={status} />
        <span className={cn('flex items-center gap-2 text-muted [writing-mode:vertical-rl]', columnCaption)}>
          <span>{name}</span>
          <span className="font-mono text-[10px] font-normal tracking-normal text-faint">{count}</span>
        </span>
      </>
    );
    const stripClass = cn(
      'flex w-10 shrink-0 flex-col items-center gap-2.5 border-r border-line-2 bg-band pt-[11px]',
      isDropTarget && 'bg-drop outline-[1.5px] -outline-offset-2 outline-drop-line outline-dashed',
      className,
    );
    return onFoldChange ? (
      <AriaButton
        onPress={() => onFoldChange(false)}
        aria-expanded={false}
        aria-label={`Expand ${name}, ${count} tasks`}
        data-status={status}
        data-folded
        className={cn(stripClass, 'cursor-pointer outline-none hover:bg-sel focus-visible:focus-ring-inset')}
      >
        {strip}
      </AriaButton>
    ) : (
      <section
        aria-label={`${name}, ${count} tasks, folded`}
        data-status={status}
        data-folded
        className={stripClass}
      >
        {strip}
      </section>
    );
  }
  return (
    <section
      aria-label={`${name}, ${count} tasks`}
      data-status={status}
      data-drop-target={isDropTarget || undefined}
      data-refused={refusal ? true : undefined}
      className={cn(
        'flex min-h-0 min-w-0 flex-[1_1_0] flex-col border-r border-line-2',
        isDropTarget && 'bg-drop outline-[1.5px] -outline-offset-2 outline-drop-line outline-dashed',
        refusal ? 'locked-hatch' : null,
        className,
      )}
    >
      <BoardColumnHeader
        status={status}
        label={label}
        count={count}
        onAdd={onAdd}
        onFold={onFoldChange ? () => onFoldChange(true) : undefined}
      />
      {refusal === true ? (
        <ColumnRefusal />
      ) : typeof refusal === 'string' ? (
        <ColumnRefusal>{refusal}</ColumnRefusal>
      ) : (
        refusal
      )}
      <div
        className={cn(
          'flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-2',
          refusal ? 'opacity-50' : null,
        )}
      >
        {children}
        {more ? (
          <div className="flex h-7 shrink-0 items-center justify-center border border-dashed border-line text-[11.5px] text-muted">
            {more}
          </div>
        ) : null}
      </div>
    </section>
  );
}

export interface ColumnRefusalProps {
  /** Defaults to "Status comes from Backlog.md. Change it in the task file." */
  children?: ReactNode;
  className?: string;
}

/**
 * Dashed band under a column header while a mirrored card is dragged: the drop is refused and this says
 * why (ledger-m3.css .m3-colnot). BoardColumn draws it through its `refusal` prop.
 */
export function ColumnRefusal({
  children = (
    <>
      Status comes from Backlog.md.
      <br />
      Change it in the task file.
    </>
  ),
  className,
}: ColumnRefusalProps) {
  return (
    <div
      role="note"
      className={cn(
        'mx-2 mt-2 shrink-0 border border-dashed border-line bg-surface px-2 py-1.5 text-center text-[11.5px] leading-[1.4] text-muted',
        className,
      )}
    >
      {children}
    </div>
  );
}

// ── Swimlanes ───────────────────────────────────────────────────────────────────────────────────────

export interface SwimlaneHeaderProps {
  /** "claude-dev", "Webhooks v2", "No assignee". */
  title: ReactNode;
  /** Avatar or MilestoneGlyph before the title. */
  lead?: ReactNode;
  /** Normal-weight note after the title: "for Ana Ruiz". */
  sub?: ReactNode;
  count: number;
  isOpen: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

/** 30px lane header on --band with a ▾/▸ chevron. A button when `onOpenChange` is set. */
export function SwimlaneHeader({
  title,
  lead,
  sub,
  count,
  isOpen,
  onOpenChange,
  className,
}: SwimlaneHeaderProps) {
  const content = (
    <>
      <span aria-hidden className="w-2.5 text-faint">
        {isOpen ? '▾' : '▸'}
      </span>
      {lead}
      <span className="truncate">{title}</span>
      {sub ? <span className="truncate text-[11.5px] font-normal text-muted">{sub}</span> : null}
      <span className="font-mono text-[10px] font-normal text-faint">{count}</span>
    </>
  );
  const base = cn(
    'flex h-[30px] w-full shrink-0 items-center gap-2 border-y border-line-2 bg-band px-3 text-left text-[12px] font-semibold',
    className,
  );
  if (!onOpenChange) return <div className={base}>{content}</div>;
  return (
    <AriaButton
      onPress={() => onOpenChange(!isOpen)}
      aria-expanded={isOpen}
      className={cn(base, 'cursor-pointer outline-none focus-visible:focus-ring-inset')}
    >
      {content}
    </AriaButton>
  );
}
