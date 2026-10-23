import { ORPCError } from '@orpc/client';
import {
  type AssigneeRef,
  type MilestoneRef,
  TASK_CHANGED,
  type Task,
  type TaskListItem,
  type TaskStatus,
} from '@pm/contracts';
import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import { describeError } from '~/features/tasks/errors';
import { client, orpc } from '~/lib/orpc';
import { STATUS_LABELS } from '~/ui';
import {
  cardsOf,
  findCard,
  insertCard,
  type Placement,
  rankFor,
  removeCard,
  shiftCounts,
} from './board-cache';
import { placementBetween } from './layout';
import { boardQueries, invalidateBoard } from './queries';

// Card moves: one PATCH per move with status, position and ifUpdatedAt. The board changes at once;
// the server's answer confirms it, or the card goes back (a TASK_CHANGED conflict puts it where the
// current task says). Moves run one after another, so a quick second move sends the updatedAt the
// first one returned. Ctrl/Cmd+Z undoes the last moves, newest first.

/** Changes the lane of a card on a swimlane board, together with the move. */
export type LanePatch = { assignee: AssigneeRef | null } | { milestone: MilestoneRef | null };

export interface MoveIntent {
  key: string;
  to: TaskStatus;
  placement: Placement;
  lane?: LanePatch;
  /** Drag or keyboard: only the wording of the conflict note differs. */
  via: 'drag' | 'keyboard';
}

interface MoveRecord {
  intent: MoveIntent;
  /** The card before the move. */
  before: TaskListItem;
  /** Its neighbours in its column before the move, to put it back on undo. */
  previous: string | null;
  next: string | null;
  isUndo: boolean;
  /** Set when an earlier failed move of the same card cancels this one. */
  cancelled: boolean;
}

export interface MoveToast {
  id: number;
  /** "PAY-140 moved to In review". */
  text: string;
  /** Read to screen readers after the text: ", position 1 of 3". */
  detail: string;
  canUndo: boolean;
}

export interface MoveProblem {
  key: string;
  /** "Couldn't move PAY-131 to In review. It went back to In progress." */
  text: string;
  /** Second line under the banner. */
  hint?: string;
  retry: () => void;
}

const label = (status: TaskStatus) => STATUS_LABELS[status];

/** A full task as a board card. */
export function toCard(task: Task | TaskListItem): TaskListItem {
  const { description: _d, createdBy: _c, createdOnBehalfOf: _o, ...card } = task as Task;
  return card;
}

/** The card's home column (the cached column of its status) and its neighbours there. */
function locateCard(queryClient: QueryClient, projectKey: string, key: string) {
  for (const { status, data } of boardQueries(queryClient, projectKey)) {
    const card = findCard(data, key);
    if (!card || card.status !== status) continue;
    const cards = cardsOf(data);
    const index = cards.findIndex((item) => item.key === key);
    return { card, previous: cards[index - 1]?.key ?? null, next: cards[index + 1]?.key ?? null };
  }
  return null;
}

/** Puts `card` (with its new status) into every cached column of the project and fixes the counts. */
function placeCard(
  queryClient: QueryClient,
  projectKey: string,
  card: TaskListItem,
  placement: Placement,
  fromStatus: TaskStatus,
) {
  for (const { queryKey, status, data } of boardQueries(queryClient, projectKey)) {
    let next = removeCard(data, card.key);
    if (status === card.status) {
      const rank = rankFor(cardsOf(next), placement, card.rank);
      next = insertCard(next, { ...card, rank }, placement);
    }
    next = shiftCounts(next, fromStatus, card.status);
    if (next !== data) queryClient.setQueryData(queryKey, next);
  }
}

/** Where the card is now in its column: "position 2 of 5". */
function positionOf(queryClient: QueryClient, projectKey: string, key: string, status: TaskStatus) {
  for (const entry of boardQueries(queryClient, projectKey)) {
    if (entry.status !== status) continue;
    const index = cardsOf(entry.data).findIndex((card) => card.key === key);
    if (index < 0) continue;
    const total = entry.data.pages[0]?.counts[status] ?? cardsOf(entry.data).length;
    return { position: index + 1, total: Math.max(total, index + 1) };
  }
  return null;
}

function patchTaskCache(queryClient: QueryClient, key: string, card: TaskListItem) {
  const queryKey = orpc.tasks.get.queryKey({ input: { key } });
  const task = queryClient.getQueryData(queryKey);
  if (task) queryClient.setQueryData(queryKey, { ...task, ...card });
}

function samePlace(card: TaskListItem, previous: string | null, next: string | null, intent: MoveIntent) {
  if (intent.lane || card.status !== intent.to) return false;
  const placement = intent.placement;
  if (placement === 'top') return previous === null;
  if (placement === 'rank') return true;
  if ('before' in placement) return placement.before === card.key || placement.before === next;
  return placement.after === card.key || placement.after === previous;
}

function moveText(intent: MoveIntent, before: TaskListItem, isUndo: boolean): string {
  const lane =
    intent.lane && 'assignee' in intent.lane
      ? intent.lane.assignee
        ? `, assigned to ${intent.lane.assignee.name}`
        : ', unassigned'
      : intent.lane && 'milestone' in intent.lane
        ? intent.lane.milestone
          ? `, in ${intent.lane.milestone.name}`
          : ', no milestone'
        : '';
  if (isUndo) return `${intent.key} moved back to ${label(intent.to)}${lane}`;
  if (before.status === intent.to && !intent.lane) return `${intent.key} moved within ${label(intent.to)}`;
  return `${intent.key} moved to ${label(intent.to)}${lane}`;
}

function conflictTask(error: unknown): Task | null {
  if (!(error instanceof ORPCError) || error.code !== TASK_CHANGED) return null;
  const task = (error.data as { task?: Task } | undefined)?.task;
  return task ?? null;
}

export interface BoardMoves {
  /** Moves a card. False when nothing changes (same place, card not on the board). */
  move: (intent: MoveIntent) => boolean;
  /** Undoes the newest move still on the stack. Returns the card's key, or null when nothing moved. */
  undo: () => string | null;
  canUndo: boolean;
  toast: MoveToast | null;
  dismissToast: () => void;
  problem: MoveProblem | null;
  dismissProblem: () => void;
}

export function useBoardMoves(projectKey: string): BoardMoves {
  const queryClient = useQueryClient();
  const queue = useRef<Promise<void>>(Promise.resolve());
  const pending = useRef(0);
  const touched = useRef(new Set<string>());
  const records = useRef<MoveRecord[]>([]);
  const undoStack = useRef<MoveRecord[]>([]);
  /** updatedAt of each card as the server last returned it, for ifUpdatedAt. */
  const serverUpdatedAt = useRef(new Map<string, string>());
  const toastId = useRef(0);
  const [toast, setToast] = useState<MoveToast | null>(null);
  const [problem, setProblem] = useState<MoveProblem | null>(null);
  const [canUndo, setCanUndo] = useState(false);

  const syncUndo = useCallback(() => setCanUndo(undoStack.current.length > 0), []);

  const settle = useCallback(() => {
    pending.current--;
    if (pending.current > 0) return;
    const keys = [...touched.current];
    touched.current.clear();
    void invalidateBoard(queryClient, projectKey);
    void queryClient.invalidateQueries({ queryKey: orpc.projects.key() });
    for (const key of keys) {
      void queryClient.invalidateQueries({ queryKey: orpc.tasks.get.key({ input: { key } }) });
      void queryClient.invalidateQueries({ queryKey: orpc.tasks.activity.key({ input: { key } }) });
      void queryClient.invalidateQueries({ queryKey: orpc.tasks.timeline.key({ input: { key } }) });
    }
  }, [queryClient, projectKey]);

  // `move` and `send` call each other (retry); refs keep both current.
  const moveRef = useRef<(intent: MoveIntent, isUndo?: boolean) => boolean>(() => false);

  const send = useCallback(
    async (record: MoveRecord) => {
      const { intent, before } = record;
      if (record.cancelled) return;
      const lane = intent.lane;
      try {
        const task = await client.tasks.update({
          key: intent.key,
          ...(intent.to !== before.status ? { status: intent.to } : {}),
          ...(typeof intent.placement === 'object' ? { position: intent.placement } : {}),
          ...(lane && 'assignee' in lane ? { assignee: lane.assignee?.id ?? null } : {}),
          ...(lane && 'milestone' in lane ? { milestone: lane.milestone?.id ?? null } : {}),
          ifUpdatedAt: serverUpdatedAt.current.get(intent.key) ?? before.updatedAt,
        });
        serverUpdatedAt.current.set(task.key, task.updatedAt);
        const card = toCard(task);
        // Keep the card where the board put it; take the server's fields (rank, updatedAt).
        for (const { queryKey, status, data } of boardQueries(queryClient, projectKey)) {
          if (status !== card.status || !findCard(data, card.key)) continue;
          queryClient.setQueryData(queryKey, {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              items: page.items.map((item) => (item.key === card.key ? card : item)),
            })),
          });
        }
        queryClient.setQueryData(orpc.tasks.get.queryKey({ input: { key: task.key } }), task);
      } catch (error) {
        const current = conflictTask(error);
        // Later moves of this card were built on this one: drop them.
        for (const other of records.current) {
          if (other !== record && other.intent.key === intent.key) other.cancelled = true;
        }
        undoStack.current = undoStack.current.filter((entry) => entry.intent.key !== intent.key);
        syncUndo();
        const truth = current ? toCard(current) : before;
        if (current) serverUpdatedAt.current.set(current.key, current.updatedAt);
        else serverUpdatedAt.current.delete(intent.key);
        const shown = locateCard(queryClient, projectKey, intent.key)?.card;
        placeCard(queryClient, projectKey, truth, 'rank', shown?.status ?? intent.to);
        if (current)
          queryClient.setQueryData(orpc.tasks.get.queryKey({ input: { key: current.key } }), current);
        else patchTaskCache(queryClient, intent.key, truth);
        setToast(null);
        const where =
          truth.status === intent.to && before.status === intent.to
            ? `Couldn't move ${intent.key}. It went back to its place in ${label(truth.status)}.`
            : `Couldn't move ${intent.key} to ${label(intent.to)}. It went back to ${label(truth.status)}.`;
        setProblem({
          key: intent.key,
          text: where,
          hint: current
            ? `Someone else changed the task while you ${intent.via === 'drag' ? 'dragged' : 'moved'} it. The board shows the latest version.`
            : describeError(error).message,
          retry: () => {
            setProblem(null);
            moveRef.current({ ...intent, ...(intent.placement === 'rank' ? { placement: 'top' } : {}) });
          },
        });
      }
    },
    [queryClient, projectKey, syncUndo],
  );

  const move = useCallback(
    (intent: MoveIntent, isUndo = false): boolean => {
      const located = locateCard(queryClient, projectKey, intent.key);
      if (!located) return false;
      const { card, previous, next } = located;
      if (samePlace(card, previous, next, intent)) return false;
      const moved: TaskListItem = {
        ...card,
        status: intent.to,
        ...(intent.lane && 'assignee' in intent.lane ? { assignee: intent.lane.assignee } : {}),
        ...(intent.lane && 'milestone' in intent.lane ? { milestone: intent.lane.milestone } : {}),
      };
      void queryClient.cancelQueries({ queryKey: orpc.tasks.list.key() });
      placeCard(queryClient, projectKey, moved, intent.placement, card.status);
      patchTaskCache(queryClient, intent.key, moved);

      const record: MoveRecord = { intent, before: card, previous, next, isUndo, cancelled: false };
      records.current.push(record);
      if (!isUndo) {
        undoStack.current.push(record);
        syncUndo();
      }
      setProblem(null);
      const position = positionOf(queryClient, projectKey, intent.key, intent.to);
      toastId.current++;
      setToast({
        id: toastId.current,
        text: moveText(intent, card, isUndo),
        detail: position ? `, position ${position.position} of ${position.total}` : '',
        canUndo: !isUndo,
      });

      pending.current++;
      touched.current.add(intent.key);
      queue.current = queue.current
        .then(() => send(record))
        .finally(() => {
          records.current = records.current.filter((entry) => entry !== record);
          settle();
        });
      return true;
    },
    [queryClient, projectKey, send, settle, syncUndo],
  );
  moveRef.current = move;

  const undo = useCallback((): string | null => {
    const record = undoStack.current.pop();
    syncUndo();
    if (!record) return null;
    const { before, intent } = record;
    const lane: LanePatch | undefined = intent.lane
      ? 'assignee' in intent.lane
        ? { assignee: before.assignee }
        : { milestone: before.milestone }
      : undefined;
    const moved = move(
      {
        key: before.key,
        to: before.status,
        placement: placementBetween(record.previous, record.next),
        ...(lane ? { lane } : {}),
        via: 'keyboard',
      },
      true,
    );
    return moved ? before.key : null;
  }, [move, syncUndo]);

  return {
    move,
    undo,
    canUndo,
    toast,
    dismissToast: useCallback(() => setToast(null), []),
    problem,
    dismissProblem: useCallback(() => setProblem(null), []),
  };
}
