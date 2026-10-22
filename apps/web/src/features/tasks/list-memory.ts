import type { TaskListSearch } from './search';

// Remembers the last filters used on each project's list, so "Back to list" from a task page returns
// to the same view with that task selected.

const lastSearch = new Map<string, TaskListSearch>();

export function rememberListSearch(projectKey: string, search: TaskListSearch): void {
  const { task: _task, ...filters } = search;
  lastSearch.set(projectKey, filters);
}

/** The list search to return to with `taskKey` selected. */
export function listSearchFor(projectKey: string, taskKey: string): TaskListSearch {
  return { ...lastSearch.get(projectKey), task: taskKey };
}
