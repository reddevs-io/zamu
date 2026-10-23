// URLs the shell links to. Task screens own /p/$projectKey; settings own /settings/*.

export const DASHBOARD_HREF = '/dashboard';
export const PROJECTS_HREF = '/projects';
export const MY_TASKS_HREF = '/my-tasks';
export const SETTINGS_HREF = '/settings/members';
export const APPEARANCE_HREF = '/settings/appearance';

/** Task list of a project. */
export function projectHref(projectKey: string): string {
  return `/p/${encodeURIComponent(projectKey)}`;
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
