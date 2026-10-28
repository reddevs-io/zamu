// Display text for the settings screens: dates, "last active", key scopes, counts.
import type { ApiKeyScopeView, WorkspaceRole } from '@pm/contracts';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

type DateInput = string | Date;

const toDate = (value: DateInput) => (typeof value === 'string' ? new Date(value) : value);

/** "Oct 20", or "Oct 20, 2025" outside the current year. */
export function formatShortDate(value: DateInput, now: Date = new Date()): string {
  const date = toDate(value);
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

/** "Now", "20m", "3h", "2d", then a short date after four weeks. */
export function formatAgo(value: DateInput, now: Date = new Date()): string {
  const elapsed = now.getTime() - toDate(value).getTime();
  if (elapsed < MINUTE) return 'Now';
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h`;
  if (elapsed < 28 * DAY) return `${Math.floor(elapsed / DAY)}d`;
  return formatShortDate(value, now);
}

/** "expires in 6 days" (rounded up), "expires in 3 hours", "expired". */
export function formatExpiry(expiresAt: DateInput, now: Date = new Date()): string {
  const left = toDate(expiresAt).getTime() - now.getTime();
  if (left <= 0) return 'expired';
  if (left < DAY) return `expires in ${plural(Math.max(1, Math.ceil(left / HOUR)), 'hour')}`;
  return `expires in ${plural(Math.ceil(left / DAY), 'day')}`;
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** "PAY, CLI" or "DOCS, CLI and WEB" for prose. */
export function listText(items: readonly string[], separator: 'comma' | 'and' = 'comma'): string {
  if (separator === 'comma' || items.length < 2) return items.join(', ');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

const ACCESS_TEXT = { read: 'read only', write: 'read and write' } as const;

/** Table cell: "PAY, CLI · read and write", "Workspace · read only", "No projects · read only". */
export function scopeText(scope: ApiKeyScopeView): string {
  const where =
    scope.projects === 'all'
      ? 'Workspace'
      : scope.projects.length === 0
        ? 'No projects'
        : listText(scope.projects.map((p) => p.key));
  return `${where} · ${ACCESS_TEXT[scope.access]}`;
}

/** Sentence for the key created dialog: "Scope: DOCS and CLI, read and write." */
export function scopeSentence(scope: ApiKeyScopeView): string {
  // A key whose only projects were deleted keeps an empty selection.
  const where =
    scope.projects === 'all'
      ? 'whole workspace'
      : scope.projects.length === 0
        ? 'no projects'
        : listText(
            scope.projects.map((p) => p.key),
            'and',
          );
  return `Scope: ${where}, ${ACCESS_TEXT[scope.access]}.`;
}

export const ROLE_LABELS: Record<WorkspaceRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
};

export function isAdminRole(role: WorkspaceRole | undefined): boolean {
  return role === 'owner' || role === 'admin';
}

/** "4 people and 3 agents in Reddevs". */
export function membersSummary(people: number, agents: number, workspace: string | undefined): string {
  const text = `${plural(people, 'person', 'people')} and ${plural(agents, 'agent')}`;
  return workspace ? `${text} in ${workspace}` : text;
}

/** Initials for an invitation row from its email: "jo.park@x.io" gives "JP". */
export function emailInitials(email: string): string {
  const local = email.split('@')[0] ?? email;
  const words = local.split(/[._+-]+/).filter(Boolean);
  const first = words[0]?.charAt(0) ?? '?';
  const last = words.length > 1 ? (words[words.length - 1]?.charAt(0) ?? '') : '';
  return (first + last).toUpperCase();
}
