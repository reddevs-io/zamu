import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

/** False during the server render and hydration, true afterwards. */
function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}

/**
 * Relative times and local dates differ between the server render and the browser (clock, time zone).
 * React keeps the server's text when hydration text mismatches, so the span is remounted once
 * hydration is done to show the browser's text.
 */
export function TimeText({ children }: { children: string }) {
  const hydrated = useHydrated();
  return (
    <span key={hydrated ? 'client' : 'server'} suppressHydrationWarning>
      {children}
    </span>
  );
}
