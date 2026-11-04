import { parseTaskFilter, type TaskFilter, type TaskFilterSearch, taskFilterSearch } from '~/features/views';

// Search params of the milestone and cycle pages: the M5 task filter (features/views/filters.ts), so
// a filtered page survives reloads and shared links, and reads like the list's.
//
//   /p/HBR/milestones/<id>?status=todo,in_progress&assignee=me&label=<id>&cycle=current
//   /p/HBR/cycles/12?assignee=agents&milestone=none&blocked=true

/** validateSearch of the planning pages: the filter params, nothing else. */
export function parsePlanningSearch(search: Record<string, unknown>): Partial<TaskFilterSearch> {
  const values = taskFilterSearch(parseTaskFilter(search));
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined),
  ) as Partial<TaskFilterSearch>;
}

/** The filter of a planning page's search, for the route loaders. */
export function planningFilter(search: Record<string, unknown>): TaskFilter {
  return parseTaskFilter(search);
}
