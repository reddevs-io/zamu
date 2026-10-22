import { useSyncExternalStore } from 'react';

// Relative and local times ("3m", "Oct 21, 16:02") depend on the clock and the browser's time zone, so the
// server cannot render them the way the browser will. useNow() is null on the server and while hydrating,
// then the current time in 30-second steps. Screens render times only once it is set.

const TICK_MS = 30_000;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

function subscribe(listener: () => void) {
  listeners.add(listener);
  timer ??= setInterval(() => {
    for (const notify of listeners) notify();
  }, TICK_MS / 3);
  return () => {
    listeners.delete(listener);
    if (!listeners.size && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

// Stable within a step, so React sees one value per 30 seconds.
const getSnapshot = () => Math.floor(Date.now() / TICK_MS) * TICK_MS;
const getServerSnapshot = () => null;

/** The current time in ms (30-second steps), or null during SSR and hydration. */
export function useNow(): number | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
