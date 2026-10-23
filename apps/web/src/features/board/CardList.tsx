import type { TaskListItem, TaskStatus } from '@pm/contracts';
import { memo, type ReactNode, useMemo } from 'react';
import {
  DropIndicator,
  type DropItem,
  GridList,
  GridListItem,
  isTextDropItem,
  useDragAndDrop,
} from 'react-aria-components';
import {
  BoardCard,
  BoardCardContent,
  Button,
  boardCardStyles,
  cn,
  dropIndicatorClass,
  isMilestoneFilled,
} from '~/ui';

// The cards of one board cell (a column, or a column inside a swimlane) as a React Aria GridList with
// drag and drop: reorder inside the cell, drop from another cell between cards or on an empty cell.

/** Drag type carrying the task key. */
export const CARD_DRAG_TYPE = 'application/x-pm-task-key';

export interface CardDrop {
  key: string;
  /** Card the drop lands next to; null for a drop on the cell itself (empty cell). */
  target: { key: string; position: 'before' | 'after' } | null;
}

export interface CardFeatures {
  usesMilestones: boolean;
  usesCycles: boolean;
  /** Field the swimlanes already show: left off the cards. */
  laneField?: 'assignee' | 'milestone' | null;
}

export interface CardListProps {
  /** "In progress" or "In progress, claude-dev": the GridList's accessible name. */
  label: string;
  status: TaskStatus;
  cards: readonly TaskListItem[];
  /** Card open in the task panel (drawn selected). */
  selected: string | null;
  /** Click or Enter on a card. */
  onOpen: (key: string) => void;
  onDrop: (drop: CardDrop) => void;
  features: CardFeatures;
  /** Turns drag and drop off (while loading). */
  isDisabled?: boolean;
  className?: string;
}

async function keyOf(items: readonly DropItem[]): Promise<string | null> {
  const item = items.find((candidate) => isTextDropItem(candidate) && candidate.types.has(CARD_DRAG_TYPE));
  if (!item || !isTextDropItem(item)) return null;
  return (await item.getText(CARD_DRAG_TYPE)) || null;
}

/** Card fields for the kit's BoardCardContent. */
export function cardContent(card: TaskListItem, features: CardFeatures) {
  return {
    taskKey: card.key,
    title: card.title,
    priority: card.priority,
    milestone:
      features.usesMilestones && features.laneField !== 'milestone' && card.milestone
        ? { name: card.milestone.name, filled: isMilestoneFilled(card.milestone.status) }
        : null,
    cycle: features.usesCycles && card.cycle ? { label: `C${card.cycle.number}` } : null,
    assignee:
      card.assignee && features.laneField !== 'assignee'
        ? { name: card.assignee.name, kind: card.assignee.kind }
        : null,
  };
}

export const CardList = memo(function CardList({
  label,
  status,
  cards,
  selected,
  onOpen,
  onDrop,
  features,
  isDisabled = false,
  className,
}: CardListProps) {
  const byKey = useMemo(() => new Map(cards.map((card) => [card.key, card])), [cards]);

  const { dragAndDropHooks } = useDragAndDrop<TaskListItem>({
    isDisabled,
    getItems: (keys): Record<string, string>[] =>
      [...keys].map((key) => ({ [CARD_DRAG_TYPE]: String(key), 'text/plain': String(key) })),
    acceptedDragTypes: [CARD_DRAG_TYPE],
    getDropOperation: (target) =>
      target.type === 'item' && target.dropPosition === 'on' ? 'cancel' : 'move',
    onReorder: (event) => {
      const key = [...event.keys][0];
      if (key == null || event.target.dropPosition === 'on') return;
      onDrop({
        key: String(key),
        target: { key: String(event.target.key), position: event.target.dropPosition },
      });
    },
    onInsert: async (event) => {
      const key = await keyOf(event.items);
      if (!key || event.target.dropPosition === 'on') return;
      onDrop({ key, target: { key: String(event.target.key), position: event.target.dropPosition } });
    },
    onRootDrop: async (event) => {
      const key = await keyOf(event.items);
      if (key) onDrop({ key, target: null });
    },
    renderDropIndicator: (target) => <DropIndicator target={target} className={dropIndicatorClass} />,
    renderDragPreview: (items) => {
      const key = items[0]?.[CARD_DRAG_TYPE];
      const card = key ? byKey.get(key) : undefined;
      if (!card) return <div className="bg-surface px-2 py-1 font-mono text-[11px]">{key}</div>;
      return <BoardCard state="dragging" className="w-[262px]" {...cardContent(card, features)} />;
    },
  });

  return (
    <GridList
      aria-label={label}
      items={cards}
      layout="stack"
      // The panel is the selection: React Aria selection stays off, so a drop never selects a card.
      selectionMode="none"
      onAction={(key) => onOpen(String(key))}
      disallowTypeAhead
      escapeKeyBehavior="none"
      dependencies={[selected, features]}
      dragAndDropHooks={dragAndDropHooks}
      data-status={status}
      renderEmptyState={() => <div className="min-h-16 flex-1" />}
      className={cn(
        'flex min-h-16 shrink-0 grow flex-col gap-1.5 outline-none',
        'drop-target:bg-drop drop-target:outline-[1.5px] drop-target:-outline-offset-2 drop-target:outline-drop-line drop-target:outline-dashed',
        className,
      )}
    >
      {(card) => (
        <GridListItem
          id={card.key}
          textValue={`${card.key} ${card.title}`}
          data-card-key={card.key}
          data-open={card.key === selected || undefined}
          className={boardCardStyles({ state: card.key === selected ? 'selected' : 'default' })}
        >
          <CardBody card={card} features={features} />
        </GridListItem>
      )}
    </GridList>
  );
});

function CardBody({ card, features }: { card: TaskListItem; features: CardFeatures }): ReactNode {
  return (
    <>
      {/* React Aria's keyboard and screen reader drag starts from this button; sighted keyboard users
          have Shift+H/J/K/L. */}
      <span className="sr-only">
        <Button slot="drag" variant="ghost">
          Drag {card.key}
        </Button>
      </span>
      <BoardCardContent {...cardContent(card, features)} />
    </>
  );
}
