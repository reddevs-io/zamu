import {
  PRIORITIES,
  type StatusCounts,
  type TaskListItem,
  type TaskSort,
  type TaskStatus,
} from '@pm/contracts';
import type { BoardColumnData } from './queries';

// Pure edits of one cached board column (an infinite query: pages of cards in rank order). Moves are
// applied to the cache at once and confirmed or rolled back when the server answers.

/** Where a card lands in its column: next to another card, at the top, or where its rank puts it. */
export type Placement = { before: string } | { after: string } | 'top' | 'rank';

/** Cards of a column in board order, each key once. */
export function cardsOf(data: BoardColumnData | undefined): TaskListItem[] {
  if (!data) return [];
  const seen = new Set<string>();
  const cards: TaskListItem[] = [];
  for (const page of data.pages) {
    for (const item of page.items) {
      if (seen.has(item.key)) continue;
      seen.add(item.key);
      cards.push(item);
    }
  }
  return cards;
}

export function findCard(data: BoardColumnData | undefined, key: string): TaskListItem | undefined {
  if (!data) return undefined;
  for (const page of data.pages) {
    const found = page.items.find((item) => item.key === key);
    if (found) return found;
  }
  return undefined;
}

export function removeCard(data: BoardColumnData, key: string): BoardColumnData {
  if (!findCard(data, key)) return data;
  return {
    ...data,
    pages: data.pages.map((page) =>
      page.items.some((item) => item.key === key)
        ? { ...page, items: page.items.filter((item) => item.key !== key) }
        : page,
    ),
  };
}

/** Replaces a card in place (the server's version after a move). */
export function replaceCard(data: BoardColumnData, card: TaskListItem): BoardColumnData {
  if (!findCard(data, card.key)) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.map((item) => (item.key === card.key ? card : item)),
    })),
  };
}

const compareRank = (a: TaskListItem, b: TaskListItem) => a.rank - b.rank || a.id.localeCompare(b.id);

function insertAt(data: BoardColumnData, pageIndex: number, index: number, card: TaskListItem) {
  return {
    ...data,
    pages: data.pages.map((page, current) => {
      if (current !== pageIndex) return page;
      const items = [...page.items];
      items.splice(index, 0, card);
      return { ...page, items };
    }),
  };
}

/**
 * Inserts a card. 'top' puts it first; before/after next to the anchor card; 'rank' (or an anchor that
 * is not loaded) where its rank sorts. A card that sorts after the loaded pages of a column with more
 * pages is left out: it shows when that page loads.
 */
export function insertCard(data: BoardColumnData, card: TaskListItem, placement: Placement): BoardColumnData {
  const cleaned = removeCard(data, card.key);
  if (!cleaned.pages.length) return cleaned;
  if (placement === 'top') return insertAt(cleaned, 0, 0, card);
  if (placement !== 'rank') {
    const anchor = 'before' in placement ? placement.before : placement.after;
    for (const [pageIndex, page] of cleaned.pages.entries()) {
      const index = page.items.findIndex((item) => item.key === anchor);
      if (index >= 0) return insertAt(cleaned, pageIndex, 'before' in placement ? index : index + 1, card);
    }
  }
  for (const [pageIndex, page] of cleaned.pages.entries()) {
    const index = page.items.findIndex((item) => compareRank(card, item) < 0);
    if (index >= 0) return insertAt(cleaned, pageIndex, index, card);
  }
  const lastIndex = cleaned.pages.length - 1;
  const last = cleaned.pages[lastIndex];
  if (!last || last.nextCursor) return cleaned;
  return insertAt(cleaned, lastIndex, last.items.length, card);
}

/** Moves one task from status `from` to `to` in the counts of every page. */
export function shiftCounts(data: BoardColumnData, from: TaskStatus, to: TaskStatus): BoardColumnData {
  if (from === to) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({ ...page, counts: shiftedCounts(page.counts, from, to) })),
  };
}

export function shiftedCounts(counts: StatusCounts, from: TaskStatus, to: TaskStatus): StatusCounts {
  if (from === to) return counts;
  return { ...counts, [from]: Math.max(0, counts[from] - 1), [to]: counts[to] + 1 };
}

/**
 * Rank for a card placed in `cards` (the target column without the moving card): between its new
 * neighbours, above the top for 'top'. Only the order matters; the server sets the real rank.
 */
export function rankFor(cards: readonly TaskListItem[], placement: Placement, fallback: number): number {
  if (placement === 'rank') return fallback;
  if (placement === 'top') return (cards[0]?.rank ?? 1) - 1;
  const anchorKey = 'before' in placement ? placement.before : placement.after;
  const index = cards.findIndex((card) => card.key === anchorKey);
  const anchor = cards[index];
  if (!anchor) return fallback;
  const neighbour = 'before' in placement ? cards[index - 1] : cards[index + 1];
  if (!neighbour) return 'before' in placement ? anchor.rank - 1 : anchor.rank + 1;
  return (anchor.rank + neighbour.rank) / 2;
}

/** Newest first, then the id (descending), as the server breaks ties. */
const byUpdated = (a: TaskListItem, b: TaskListItem) =>
  b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id);

/**
 * The order tasks.list `sort` gives (packages/core SORT_PARTS): priority highest first, due soonest first
 * (no date last), last updated or created newest first, manual by rank; ties by last update, then id.
 */
export function compareBySort(sort: TaskSort, a: TaskListItem, b: TaskListItem): number {
  switch (sort) {
    case 'priority':
      return PRIORITIES.indexOf(b.priority) - PRIORITIES.indexOf(a.priority) || byUpdated(a, b);
    case 'due': {
      const x = a.dueDate ?? null;
      const y = b.dueDate ?? null;
      if (x !== y) {
        if (x === null) return 1;
        if (y === null) return -1;
        return x.localeCompare(y);
      }
      return byUpdated(a, b);
    }
    case 'created':
      return b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id);
    case 'manual':
      return a.rank - b.rank || byUpdated(a, b);
    default:
      return byUpdated(a, b);
  }
}

/**
 * Where a card lands in a column ordered by `sort` (not manual): before the first card that sorts after
 * it, else after the last one. `cards` is the column without the moving card.
 */
export function sortPlacement(cards: readonly TaskListItem[], card: TaskListItem, sort: TaskSort): Placement {
  const next = cards.find((other) => other.key !== card.key && compareBySort(sort, card, other) < 0);
  if (next) return { before: next.key };
  const last = cards.filter((other) => other.key !== card.key).at(-1);
  return last ? { after: last.key } : 'top';
}
