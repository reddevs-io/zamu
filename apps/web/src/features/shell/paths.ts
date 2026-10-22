// URLs the shell links to. Task screens (M1-11) own /p/$projectKey; settings (M1-12) own /settings/*.

export const PROJECTS_HREF = '/projects';
export const SETTINGS_HREF = '/settings/members';

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
