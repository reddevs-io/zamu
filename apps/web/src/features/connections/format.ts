// Display text for the Git connections page: provider hints, the checked column, the token preview
// and the page subtitle. Copy follows the M3 canvas (frames 1a to 1j).
import type { GitProvider } from '@zamu/contracts';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** The address a provider usually lives at; empty for Gitea/Forgejo, which is always self-hosted. */
export const DEFAULT_HOSTS: Record<GitProvider, string> = {
  github: 'github.com',
  gitlab: 'gitlab.com',
  gitea: '',
};

/** Short provider name for a suggested connection name ("GitLab · reddevs"). */
const SHORT_NAMES: Record<GitProvider, string> = { github: 'GitHub', gitlab: 'GitLab', gitea: 'Forgejo' };

/** Hint under the Host field. */
export function hostHint(provider: GitProvider): string {
  switch (provider) {
    case 'github':
      return 'github.com, or your GitHub Enterprise address, like github.example.com.';
    case 'gitlab':
      return "gitlab.com, or your server's address, like git.example.com.";
    case 'gitea':
      return "Your server's address, like git.example.com or git.example.com:3000.";
  }
}

/** What the token needs, per provider. Plain text with the scope names in `code`. */
export function scopeHint(provider: GitProvider): { before: string; code: string[]; after: string } {
  switch (provider) {
    case 'github':
      return {
        before: 'GitHub: a fine-grained token with read-only',
        code: ['Contents'],
        after: 'access to the repositories. Nothing more is needed.',
      };
    case 'gitlab':
      return {
        before: 'GitLab: a personal, group or project token with the',
        code: ['read_api'],
        after: 'scope and at least the Reporter role. Nothing more is needed.',
      };
    case 'gitea':
      return {
        before: 'Gitea / Forgejo: a token with the',
        code: ['read:repository', 'read:user'],
        after: 'scopes. Nothing more is needed.',
      };
  }
}

/** "glpat-…3kd" for a typed token, so people can tell which one they pasted; '' for short values. */
export function tokenPreview(token: string): string {
  const value = token.trim();
  if (value.length < 12) return '';
  return `${value.slice(0, 6)}…${value.slice(-3)}`;
}

/** "GitLab · reddevs" from a working test, for an empty Name field. */
export function suggestedName(provider: GitProvider, login: string | null): string {
  return login ? `${SHORT_NAMES[provider]} · ${login}` : SHORT_NAMES[provider];
}

/** "just now", "4m ago", "1h ago", then "Oct 21" (with the year outside the current one). */
export function checkedText(value: string, now: number): string {
  const date = new Date(value);
  const elapsed = now - date.getTime();
  if (elapsed < MINUTE) return 'just now';
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m ago`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h ago`;
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

export type ConnectionsState = 'list' | 'empty' | 'loading' | 'error';

/** Subtitle under "Git connections" (frames 1a, 1g, 1h, 1j). */
export function connectionsSubtitle(view: ConnectionsState, count: number, canManage: boolean): string {
  if (view === 'empty')
    return 'Read access to GitHub, GitLab or Gitea/Forgejo, for Backlog.md mirrors and imports.';
  if (view !== 'list') return 'Projects use connections to read Backlog.md from a repository.';
  if (!canManage) return 'Connections to git providers. Projects use them to read Backlog.md.';
  const noun = count === 1 ? 'connection' : 'connections';
  return `${count} ${noun}. Projects use them to read Backlog.md from a repository.`;
}

/** "Three projects read …" for the delete confirmation. */
export function deleteSentence(projectCount: number): string {
  if (projectCount === 0) return 'No project reads Backlog.md through this connection.';
  const words = ['', 'One project reads', 'Two projects read', 'Three projects read', 'Four projects read'];
  const subject = words[projectCount] ?? `${projectCount} projects read`;
  const their = projectCount === 1 ? 'Its mirror pauses' : 'Their mirrors pause';
  const tasks = projectCount === 1 ? 'Its tasks stay' : 'Their tasks stay';
  return `${subject} Backlog.md through this connection. ${their} until you pick another connection for ${projectCount === 1 ? 'it' : 'them'}. ${tasks} as they are.`;
}
