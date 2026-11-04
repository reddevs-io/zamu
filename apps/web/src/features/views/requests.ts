import { useEffect, useRef } from 'react';
import type { FilterField } from './filters';

// Lets the palette (and keys) open the view header's Filter and Display popovers without holding
// a ref to them: commands call requestFilterMenu() / requestDisplayOptions(), and the mounted
// FilterButton / DisplayButton opens. Nothing happens when no view is mounted.

export type ViewRequest = { kind: 'filter'; field?: FilterField } | { kind: 'display' };

const listeners = new Set<(request: ViewRequest) => void>();

function emit(request: ViewRequest) {
  for (const listener of listeners) listener(request);
}

/** Open the Filter menu, or straight into one field's submenu ("Filter by label…"). */
export function requestFilterMenu(field?: FilterField) {
  emit(field ? { kind: 'filter', field } : { kind: 'filter' });
}

/** Open the Display options popover. */
export function requestDisplayOptions() {
  emit({ kind: 'display' });
}

/** Called with every request while mounted. */
export function useViewRequests(onRequest: (request: ViewRequest) => void) {
  const ref = useRef(onRequest);
  ref.current = onRequest;
  useEffect(() => {
    const listener = (request: ViewRequest) => ref.current(request);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
}
