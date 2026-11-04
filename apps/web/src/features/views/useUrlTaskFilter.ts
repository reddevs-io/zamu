import { useNavigate, useRouterState } from '@tanstack/react-router';
import { useCallback, useMemo, useRef } from 'react';
import {
  type ParseTaskFilterOptions,
  parseTaskFilter,
  sameTaskFilter,
  type TaskFilter,
  withTaskFilter,
} from './filters';

/**
 * The view's filter in the URL (see filters.ts for the params): [filter, setFilter]. setFilter
 * keeps the other params (task, view, lanes) and replaces the history entry, so the back button
 * leaves the view instead of stepping through every checkbox.
 *
 * Reads the location's search as parsed from the URL, before the route's validateSearch, so the
 * filter survives routes whose validateSearch doesn't know the M5 params yet. Routes should still
 * keep them: validateSearch can spread taskFilterSearch(parseTaskFilter(search)).
 */
export function useUrlTaskFilter(options: ParseTaskFilterOptions = {}) {
  const search = useRouterState({ select: (state) => state.location.search as Record<string, unknown> });
  const navigate = useNavigate();
  const labels = options.labels;
  const parsed = useMemo(() => parseTaskFilter(search, labels ? { labels } : {}), [search, labels]);
  // Keep the same object while the URL holds the same filter, so query keys and memos stay put.
  const stable = useRef(parsed);
  if (!sameTaskFilter(stable.current, parsed)) stable.current = parsed;
  const filter = stable.current;

  const setFilter = useCallback(
    (next: TaskFilter) => {
      void navigate({
        to: '.',
        // biome-ignore lint/suspicious/noExplicitAny: the filter params exist on every view route
        search: ((previous: Record<string, unknown>) => withTaskFilter(previous, next)) as any,
        replace: true,
      });
    },
    [navigate],
  );
  return [filter, setFilter] as const;
}
