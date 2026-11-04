import type { Placement } from './board-cache';

// Keyboard geometry of the board: which card J/K (↓/↑) and ←/→ land on, where Shift+J/K put a card, and
// which column Shift+←/→ move it to. Columns hold cells: one per lane (or a single cell without lanes).

export interface NavCell {
  /** Lane id, or null without swimlanes. */
  lane: string | null;
  keys: readonly string[];
}

export interface NavColumn {
  /** The column: a status, or a group key when the board groups by another field. */
  id: string;
  /** Open lanes top to bottom. */
  cells: readonly NavCell[];
}

export type Direction = 'up' | 'down' | 'left' | 'right';

interface Location {
  column: number;
  cell: number;
  /** Index inside the cell. */
  index: number;
  /** Index inside the whole column (cells concatenated). */
  flat: number;
}

const flatKeys = (column: NavColumn) => column.cells.flatMap((cell) => cell.keys);

export function locate(columns: readonly NavColumn[], key: string): Location | null {
  for (const [columnIndex, column] of columns.entries()) {
    let flat = 0;
    for (const [cellIndex, cell] of column.cells.entries()) {
      const index = cell.keys.indexOf(key);
      if (index >= 0) return { column: columnIndex, cell: cellIndex, index, flat: flat + index };
      flat += cell.keys.length;
    }
  }
  return null;
}

/** Result of a focus move: the card to focus, or `end` when J ran past the last loaded card. */
export type FocusTarget = { key: string } | { end: string } | null;

/**
 * Card that J or ↓ (down), K or ↑ (up), ← (left) or → (right) moves to. Without a current card, the first card
 * of the board. Columns without cards are skipped; between columns the lane and the row are kept when
 * they exist.
 */
export function focusTarget(
  columns: readonly NavColumn[],
  current: string | null,
  direction: Direction,
): FocusTarget {
  const here = current ? locate(columns, current) : null;
  if (!here) {
    const first = columns.map(flatKeys).find((keys) => keys.length);
    const key = direction === 'up' ? first?.at(-1) : first?.[0];
    return key ? { key } : null;
  }
  const column = columns[here.column];
  if (!column) return null;
  if (direction === 'down' || direction === 'up') {
    const keys = flatKeys(column);
    const next = keys[here.flat + (direction === 'down' ? 1 : -1)];
    if (next) return { key: next };
    if (direction === 'down') return { end: column.id };
    return { key: keys[here.flat] ?? current ?? '' };
  }
  const step = direction === 'right' ? 1 : -1;
  for (let index = here.column + step; index >= 0 && index < columns.length; index += step) {
    const target = columns[index];
    if (!target) continue;
    const keys = flatKeys(target);
    if (!keys.length) continue;
    const lane = column.cells[here.cell]?.lane ?? null;
    const sameLane = target.cells.find((cell) => cell.lane === lane && cell.keys.length);
    if (lane !== null && sameLane) {
      return { key: sameLane.keys[Math.min(here.index, sameLane.keys.length - 1)] ?? keys[0] ?? '' };
    }
    return { key: keys[Math.min(here.flat, keys.length - 1)] ?? '' };
  }
  return { key: current ?? '' };
}

/**
 * Placement for Shift+J (down) or Shift+K (up): after the next card or before the previous one in
 * the same cell. Null at the edge of the cell.
 */
export function reorderPlacement(
  columns: readonly NavColumn[],
  key: string,
  direction: 'up' | 'down',
): Placement | null {
  const here = locate(columns, key);
  if (!here) return null;
  const cell = columns[here.column]?.cells[here.cell];
  if (!cell) return null;
  if (direction === 'down') {
    const next = cell.keys[here.index + 1];
    return next ? { after: next } : null;
  }
  const previous = cell.keys[here.index - 1];
  return previous ? { before: previous } : null;
}

/** Column Shift+← or Shift+→ moves a card to: the neighbouring board column, folded or not. */
export function columnStep<T extends string>(
  columns: readonly T[],
  from: T,
  direction: 'left' | 'right',
): T | null {
  const index = columns.indexOf(from);
  if (index < 0) return null;
  return columns[index + (direction === 'right' ? 1 : -1)] ?? null;
}

/** True when the card has a neighbour above (up) or below (down) in its own cell. */
export function hasNeighbour(columns: readonly NavColumn[], key: string, direction: 'up' | 'down'): boolean {
  const here = locate(columns, key);
  if (!here) return false;
  const cell = columns[here.column]?.cells[here.cell];
  return cell?.keys[here.index + (direction === 'down' ? 1 : -1)] !== undefined;
}

/**
 * Placement that puts a card back between the neighbours it had in its column (undo): after the card
 * that was above it, else before the one that was below it, else at the top.
 */
export function placementBetween(previous: string | null, next: string | null): Placement {
  if (previous) return { after: previous };
  if (next) return { before: next };
  return 'top';
}
