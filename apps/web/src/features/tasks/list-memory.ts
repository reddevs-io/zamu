import type { TaskListSearch, TaskView } from './search';

// Remembers, per project:
// - the last filters used on its tasks (in memory), so "Back to list" from a task page returns to the
//   same view with that task focused (?focus=, which the list reads once and drops);
// - the List / Board choice (in local storage), so opening the project again shows the same view.

const lastSearch = new Map<string, TaskListSearch>();

export function rememberListSearch(projectKey: string, search: TaskListSearch): void {
  const { task: _task, focus: _focus, ...filters } = search;
  lastSearch.set(projectKey, filters);
}

/**
 * The list (or board) search to return to with `taskKey` focused. ?task= would open the task view
 * again (old links redirect there), so the row comes back through ?focus=.
 */
export function listSearchFor(projectKey: string, taskKey: string): TaskListSearch {
  return { ...lastSearch.get(projectKey), focus: taskKey };
}

const viewKey = (projectKey: string) => `pm:view:${projectKey}`;

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    // Storage can be blocked (privacy settings); the view then simply is not remembered.
    return null;
  }
}

/** Saves the List / Board choice of a project. */
export function rememberView(projectKey: string, view: TaskView): void {
  try {
    storage()?.setItem(viewKey(projectKey), view);
  } catch {
    // Quota or privacy errors: not remembering is fine.
  }
}

/** The saved List / Board choice of a project, or null when there is none (or on the server). */
export function rememberedView(projectKey: string): TaskView | null {
  try {
    const value = storage()?.getItem(viewKey(projectKey));
    return value === 'board' || value === 'list' ? value : null;
  } catch {
    return null;
  }
}
