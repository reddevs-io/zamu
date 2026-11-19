import type { TaskStatus } from '@zamu/contracts';
import { useSyncExternalStore } from 'react';

// The last tasks a person opened, for the palette's Recent section. Kept in localStorage per person,
// newest first, five at most. The shell records the task view; the peek (M5-13) can call rememberTask too.

export interface RecentTask {
  key: string;
  title: string;
  status: TaskStatus;
  projectName: string;
}

export const RECENT_LIMIT = 5;

export function recentStorageKey(userId: string): string {
  return `zamu.palette.recent:${userId}`;
}

const listeners = new Set<() => void>();
const cache = new Map<string, readonly RecentTask[]>();
const EMPTY: readonly RecentTask[] = [];

function isRecentTask(value: unknown): value is RecentTask {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.key === 'string' &&
    typeof entry.title === 'string' &&
    typeof entry.status === 'string' &&
    typeof entry.projectName === 'string'
  );
}

function read(userId: string): readonly RecentTask[] {
  const cached = cache.get(userId);
  if (cached) return cached;
  let list: readonly RecentTask[] = EMPTY;
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(recentStorageKey(userId)) ?? '[]');
    if (Array.isArray(parsed)) list = parsed.filter(isRecentTask).slice(0, RECENT_LIMIT);
  } catch {
    list = EMPTY;
  }
  cache.set(userId, list);
  return list;
}

/** Puts a task first in the person's recent list (moving it up if it is there already). */
export function rememberTask(userId: string, task: RecentTask) {
  const current = read(userId);
  const first = current[0];
  if (
    first &&
    first.key === task.key &&
    first.title === task.title &&
    first.status === task.status &&
    first.projectName === task.projectName
  )
    return;
  const next = [task, ...current.filter((entry) => entry.key !== task.key)].slice(0, RECENT_LIMIT);
  cache.set(userId, next);
  try {
    window.localStorage.setItem(recentStorageKey(userId), JSON.stringify(next));
  } catch {
    // Storage full or blocked: the list still holds for this page.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The person's recent tasks, newest first; empty on the server and before the account loads. */
export function useRecentTasks(userId: string | undefined): readonly RecentTask[] {
  return useSyncExternalStore(
    subscribe,
    () => (userId ? read(userId) : EMPTY),
    () => EMPTY,
  );
}

/** Test helper: forget the in-memory copies (localStorage is cleared by the test). */
export function resetRecentForTests() {
  cache.clear();
}
