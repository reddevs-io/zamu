import type { TaskStatus } from '@pm/contracts';
import { useEffect, useRef } from 'react';
import { isTextDropItem, useDrop } from 'react-aria-components';
import {
  Avatar,
  BoardCardSkeleton,
  BoardColumn,
  BoardColumnHeader,
  cn,
  isMilestoneFilled,
  lockedHatch,
  MilestoneGlyph,
  Skeleton,
  STATUS_LABELS,
  SwimlaneHeader,
} from '~/ui';
import { CARD_DRAG_TYPE, type CardDrop, type CardFeatures, CardList } from './CardList';
import type { ColumnState } from './data';
import type { Lane } from './lanes';

// Board bodies: plain columns, or swimlanes (a header row, then one row of cells per lane).

export interface BoardBodyProps {
  /** Every board status in order (folded ones included). */
  statuses: readonly TaskStatus[];
  isFolded: (status: TaskStatus) => boolean;
  onFoldChange: (status: TaskStatus, folded: boolean) => void;
  columns: Partial<Record<TaskStatus, ColumnState>>;
  /** Column counts under the filters. */
  countOf: (status: TaskStatus) => number;
  selected: string | null;
  /** Opens a card in the task panel. */
  onOpen: (key: string) => void;
  /** A card dropped into a cell (lane null without swimlanes). */
  onDrop: (drop: CardDrop, status: TaskStatus, lane: string | null) => void;
  onAdd?: (status: TaskStatus) => void;
  features: CardFeatures;
  /**
   * Mirrored projects: while a card whose status comes from Backlog.md is dragged, its status. Every
   * other column hatches, dims its cards, shows the refusal band and refuses the drop.
   */
  refuseFrom?: TaskStatus | null;
  /** A card drag started (any column). */
  onCardDragStart?: (key: string) => void;
  onCardDragEnd?: () => void;
}

const COLUMN_MIN = 'min-w-[220px]';

/** Fetches the next page when the "N more" footer scrolls into view. */
function MoreFooter({ column, count }: { column: ColumnState; count: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const fetchMore = useRef(column.fetchMore);
  fetchMore.current = column.fetchMore;
  const busy = column.isFetchingMore;
  useEffect(() => {
    const node = ref.current;
    if (!node || busy || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void fetchMore.current();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [busy]);
  const left = Math.max(0, count - column.cards.length);
  return <span ref={ref}>{busy ? 'Loading…' : `${left} more · scroll or press J`}</span>;
}

/** Folded column strip that also takes dropped cards (they go to the top of that status). */
function FoldedColumn({
  status,
  count,
  onExpand,
  onDropCard,
  isRefused = false,
}: {
  status: TaskStatus;
  count: number;
  onExpand: () => void;
  onDropCard: (key: string) => void;
  /** A mirrored card is dragged from another column: no drop here. */
  isRefused?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { dropProps, isDropTarget } = useDrop({
    ref,
    getDropOperation: (types) => (!isRefused && types.has(CARD_DRAG_TYPE) ? 'move' : 'cancel'),
    onDrop: async (event) => {
      const item = event.items.find(
        (candidate) => isTextDropItem(candidate) && candidate.types.has(CARD_DRAG_TYPE),
      );
      if (!item || !isTextDropItem(item)) return;
      const key = await item.getText(CARD_DRAG_TYPE);
      if (key) onDropCard(key);
    },
  });
  return (
    <div ref={ref} {...dropProps} className={cn('flex shrink-0', isRefused && lockedHatch)}>
      <BoardColumn
        status={status}
        count={count}
        isFolded
        isDropTarget={isDropTarget}
        onFoldChange={(folded) => {
          if (!folded) onExpand();
        }}
      />
    </div>
  );
}

export function BoardColumns({
  statuses,
  isFolded,
  onFoldChange,
  columns,
  countOf,
  selected,
  onOpen,
  onDrop,
  onAdd,
  features,
  refuseFrom = null,
  onCardDragStart,
  onCardDragEnd,
}: BoardBodyProps) {
  return (
    <div className="flex min-h-0 flex-1 overflow-x-auto">
      {statuses.map((status) => {
        const count = countOf(status);
        const refused = refuseFrom != null && status !== refuseFrom;
        if (isFolded(status)) {
          return (
            <FoldedColumn
              key={status}
              status={status}
              count={count}
              onExpand={() => onFoldChange(status, false)}
              onDropCard={(key) => onDrop({ key, target: null }, status, null)}
              isRefused={refused}
            />
          );
        }
        const column = columns[status];
        return (
          <BoardColumn
            key={status}
            status={status}
            count={count}
            refusal={refused || undefined}
            onFoldChange={(folded) => onFoldChange(status, folded)}
            onAdd={onAdd ? () => onAdd(status) : undefined}
            more={column?.hasMore ? <MoreFooter column={column} count={count} /> : undefined}
            className={cn(
              COLUMN_MIN,
              'has-[[data-drop-target]]:bg-drop has-[[data-drop-target]]:outline-[1.5px] has-[[data-drop-target]]:-outline-offset-2 has-[[data-drop-target]]:outline-drop-line has-[[data-drop-target]]:outline-dashed',
            )}
          >
            {column && !column.isLoading ? (
              <CardList
                label={STATUS_LABELS[status]}
                status={status}
                cards={column.cards}
                selected={selected}
                onOpen={onOpen}
                onDrop={(drop) => onDrop(drop, status, null)}
                features={features}
                refuseDrops={refused}
                onDragStart={onCardDragStart}
                onDragEnd={onCardDragEnd}
              />
            ) : (
              <ColumnSkeleton cards={Math.min(Math.max(count, 1), 3)} />
            )}
          </BoardColumn>
        );
      })}
    </div>
  );
}

function ColumnSkeleton({ cards }: { cards: number }) {
  const widths = ['70%', '55%', '80%'];
  return (
    <>
      {Array.from({ length: cards }, (_, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
        <BoardCardSkeleton key={index} titleWidth={widths[index % widths.length]} />
      ))}
    </>
  );
}

/** Loading board (frame 12): a header bar and a few placeholder cards per column. */
export function BoardSkeleton({ columns }: { columns: number }) {
  const shapes = [['70%', '50%'], ['80%', '60%', '40%'], ['55%'], ['75%', '65%']];
  return (
    <div aria-busy className="flex min-h-0 flex-1">
      <span className="sr-only">Loading the board</span>
      {Array.from({ length: Math.max(columns, 1) }, (_, index) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
          key={index}
          className={cn('flex flex-[1_1_0] flex-col gap-1.5 border-r border-line-2 p-2', COLUMN_MIN)}
        >
          <Skeleton width={90} className="mx-1 mt-1.5 mb-2" />
          {(shapes[index % shapes.length] ?? []).map((width, card) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
            <BoardCardSkeleton key={card} titleWidth={width} />
          ))}
        </div>
      ))}
    </div>
  );
}

export interface BoardLanesProps extends BoardBodyProps {
  lanes: readonly Lane[];
  collapsed: ReadonlySet<string>;
  onCollapsedChange: (laneId: string, collapsed: boolean) => void;
}

/** Swimlanes (frame 09). Folded columns collapse into one "+N" strip at the right. */
export function BoardLanes({
  statuses,
  isFolded,
  onFoldChange,
  countOf,
  selected,
  onOpen,
  onDrop,
  onAdd,
  features,
  lanes,
  collapsed,
  onCollapsedChange,
  refuseFrom = null,
  onCardDragStart,
  onCardDragEnd,
}: BoardLanesProps) {
  const open = statuses.filter((status) => !isFolded(status));
  const folded = statuses.filter((status) => isFolded(status));
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto">
      <div className="sticky top-0 z-[2] flex min-w-fit bg-bg">
        {open.map((status) => (
          <BoardColumnHeader
            key={status}
            status={status}
            count={countOf(status)}
            onAdd={onAdd ? () => onAdd(status) : undefined}
            onFold={() => onFoldChange(status, true)}
            className={cn('flex-[1_1_0] border-r', COLUMN_MIN)}
          />
        ))}
        {folded.length ? (
          <button
            type="button"
            onClick={() => {
              for (const status of folded) onFoldChange(status, false);
            }}
            aria-label={`Show ${folded.map((status) => STATUS_LABELS[status]).join(' and ')}`}
            title={folded.map((status) => `${STATUS_LABELS[status]} ${countOf(status)}`).join(', ')}
            className="flex h-[34px] w-10 shrink-0 cursor-pointer items-center justify-center border-b border-line-2 bg-band font-mono text-[10px] text-faint outline-none hover:bg-sel focus-visible:focus-ring-inset"
          >
            +{folded.length}
          </button>
        ) : null}
      </div>
      {lanes.map((lane) => {
        const isOpen = !collapsed.has(lane.id);
        return (
          <section key={lane.id} aria-label={`${lane.title}, ${lane.count} tasks`} className="min-w-fit">
            <SwimlaneHeader
              title={lane.title}
              lead={laneLead(lane)}
              sub={lane.assignee?.responsible ? `for ${lane.assignee.responsible.name}` : undefined}
              count={lane.count}
              isOpen={isOpen}
              onOpenChange={(next) => onCollapsedChange(lane.id, !next)}
              className="border-t-0"
            />
            {isOpen ? (
              <div className="flex">
                {open.map((status) => {
                  const refused = refuseFrom != null && status !== refuseFrom;
                  return (
                    <div
                      key={status}
                      data-refused={refused || undefined}
                      className={cn(
                        'flex flex-[1_1_0] flex-col border-r border-line-2 p-2',
                        COLUMN_MIN,
                        'has-[[data-drop-target]]:bg-drop',
                        refused && lockedHatch,
                      )}
                    >
                      <CardList
                        label={`${STATUS_LABELS[status]}, ${lane.title}`}
                        status={status}
                        cards={lane.cells[status] ?? []}
                        selected={selected}
                        onOpen={onOpen}
                        onDrop={(drop) => onDrop(drop, status, lane.id)}
                        features={features}
                        refuseDrops={refused}
                        onDragStart={onCardDragStart}
                        onDragEnd={onCardDragEnd}
                        className={cn('min-h-12', refused && 'opacity-50')}
                      />
                    </div>
                  );
                })}
                {folded.length ? <div aria-hidden className="w-10 shrink-0 bg-band" /> : null}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

function laneLead(lane: Lane) {
  if (lane.assignee) return <Avatar name={lane.assignee.name} kind={lane.assignee.kind} />;
  if (lane.milestone) return <MilestoneGlyph filled={isMilestoneFilled(lane.milestone.status)} />;
  return null;
}
