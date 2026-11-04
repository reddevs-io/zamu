import { useSyncExternalStore } from 'react';

/**
 * The peek (M5): a temporary overlay with a task's essentials, opened with Space on a selected row or
 * card. The list (M5-11), board (M5-12) and Home (M5-14) call openPeek; the task view workstream
 * (M5-13) renders it in <PeekHost />, mounted once in the shell.
 *
 * Keep this file as the contract between those workstreams; change it only from the primary session.
 */

export interface PeekRequest {
  /** The task shown: "PAY-142". */
  key: string;
  /** The view's ordered keys, so J / K move the peek to the next or previous task. */
  keys: readonly string[];
  /** Where it was opened: "List", "Board", "Home". Used when Enter opens the full task view. */
  from: string;
  /** Called with the new key when J / K move the peek, so the view can move its focus along. */
  onMove?: (key: string) => void;
}

let current: PeekRequest | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function openPeek(request: PeekRequest) {
  current = request;
  emit();
}

export function closePeek() {
  if (!current) return;
  current = null;
  emit();
}

/** Space on the same task closes it; on another task it switches. */
export function togglePeek(request: PeekRequest) {
  if (current?.key === request.key) closePeek();
  else openPeek(request);
}

/** Move to another key of the same request (J / K). */
export function movePeek(key: string) {
  if (!current) return;
  current = { ...current, key };
  current.onMove?.(key);
  emit();
}

export function usePeek(): PeekRequest | null {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
}

export function isPeekOpen(): boolean {
  return current !== null;
}
