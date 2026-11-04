// URLs the shell links to. Task screens own /p/$projectKey; settings own /settings/*.

/** Home: what needs you across every project (M5-14 builds it; the dashboard stands in until then). */
export const HOME_HREF = '/';
export const SETTINGS_HREF = '/settings/members';
export const MEMBERS_HREF = '/settings/members';
export const MY_KEYS_HREF = '/settings/my-keys';
export const APPEARANCE_HREF = '/settings/appearance';

// M4 pages that redirect to Home since M5. Kept for the screens that still link to them until M5-14.
export const DASHBOARD_HREF = '/dashboard';
export const PROJECTS_HREF = '/projects';
export const MY_TASKS_HREF = '/my-tasks';

/** A project's pages, as linked from the sidebar and the palette. */
export type ProjectPage = 'list' | 'board' | 'milestones' | 'cycles' | 'settings';

/** Task list of a project. */
export function projectHref(projectKey: string): string {
  return `/p/${encodeURIComponent(projectKey)}`;
}

/** /p/PAY, /p/PAY?view=board, /p/PAY/milestones, /p/PAY/cycles, /p/PAY/settings. */
export function projectPageHref(projectKey: string, page: ProjectPage): string {
  const base = projectHref(projectKey);
  if (page === 'list') return base;
  if (page === 'board') return `${base}?view=board`;
  return `${base}/${page}`;
}

/** The task view of a task. */
export function taskHref(taskKey: string): string {
  const projectKey = taskKey.replace(/-[^-]*$/, '');
  return `${projectHref(projectKey)}/${encodeURIComponent(taskKey)}`;
}

/** The project key in /p/PAY or /p/PAY/PAY-142, upper-cased; undefined elsewhere. */
export function projectKeyFromPath(pathname: string): string | undefined {
  const match = /^\/p\/([^/]+)/.exec(pathname);
  if (!match?.[1]) return undefined;
  try {
    return decodeURIComponent(match[1]).toUpperCase();
  } catch {
    return undefined;
  }
}

const PROJECT_SUBPAGES = new Set(['milestones', 'cycles', 'settings', 'backlog-setup']);

/** The task key in /p/PAY/PAY-142 (the task view), upper-cased; undefined elsewhere. */
export function taskKeyFromPath(pathname: string): string | undefined {
  const match = /^\/p\/[^/]+\/([^/]+)\/?$/.exec(pathname);
  if (!match?.[1] || PROJECT_SUBPAGES.has(match[1])) return undefined;
  try {
    return decodeURIComponent(match[1]).toUpperCase();
  } catch {
    return undefined;
  }
}

/**
 * Which of a project's pages the URL shows, for the sidebar highlight: the list or board (by ?view), or a
 * sub-page. undefined for the task view and pages outside the project.
 */
export function projectPageFromLocation(
  pathname: string,
  search: { view?: unknown },
): ProjectPage | undefined {
  const match = /^\/p\/[^/]+(?:\/([^/]+))?/.exec(pathname);
  if (!match) return undefined;
  const sub = match[1];
  if (!sub) return search.view === 'board' ? 'board' : 'list';
  if (sub === 'milestones' || sub === 'cycles' || sub === 'settings') return sub;
  return undefined;
}
