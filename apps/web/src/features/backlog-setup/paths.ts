// URLs around the Backlog.md setup.

/** Project settings (M3-09): where Cancel goes and the source is managed. */
export function projectSettingsHref(projectKey: string): string {
  return `/p/${encodeURIComponent(projectKey)}/settings`;
}

/** Settings → Backlog.md with the webhook dialog open. */
export function backlogWebhookHref(projectKey: string): string {
  return `${projectSettingsHref(projectKey)}/backlog?webhook=1`;
}
