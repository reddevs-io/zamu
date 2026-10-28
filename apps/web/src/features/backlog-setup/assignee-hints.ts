import type { BacklogMappingsView } from '@pm/contracts';
import { agentNameFrom, looksLikeAgent, type SuggestionMember } from './agent-suggestions';

// The other lines of the note under the Assignees table: a member whose name matches a "No one" row
// (members added after setup, so Edit mappings can catch up), and people to invite for values that
// match nobody and don't look like agents.

/**
 * Lowercase, without spaces, dashes and underscores; curly apostrophes become straight ones. Same
 * rule as normalizeName in packages/core/src/backlog/mappings.ts (parity test in the test file).
 */
export function normalizeName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[\s\-_]+/g, '');
}

/**
 * The member an assignee value names, by the rule of core's matchAssigneeByName: `@name` or `name`
 * against member names and email local parts. Null when nobody or more than one member matches.
 * Agents have no email here (core's synthetic `name.uuid@agents.invalid` never matches a value).
 */
export function matchMemberByName<M extends SuggestionMember>(
  value: string,
  members: readonly M[],
): M | null {
  const name = normalizeName(value.replace(/^@+/, ''));
  if (!name) return null;
  const matches = new Map<string, M>();
  for (const member of members) {
    const local = member.email?.split('@')[0] ?? '';
    if (normalizeName(member.name) === name || (local && normalizeName(local) === name)) {
      matches.set(member.id, member);
    }
  }
  return matches.size === 1 ? ([...matches.values()][0] ?? null) : null;
}

export interface NameMatch<M extends SuggestionMember = SuggestionMember> {
  /** Assignee value as in the files. */
  from: string;
  member: M;
}

/** "No one" rows that exactly one member matches by name, in table order. */
export function nameMatches<M extends SuggestionMember>(
  view: Pick<BacklogMappingsView, 'assignee'>,
  members: readonly M[],
): NameMatch<M>[] {
  const found: NameMatch<M>[] = [];
  for (const row of view.assignee) {
    if (row.userId) continue;
    const member = matchMemberByName(row.from, members);
    if (member) found.push({ from: row.from, member });
  }
  return found;
}

export interface InviteDraft {
  /** Assignee value as in the files. */
  from: string;
  /** Tasks carrying it. */
  count: number;
}

/**
 * "No one" rows that don't look like a coding agent, in table order: people to invite. Rows in
 * `skip` (a name match) are left out.
 */
export function inviteSuggestions(
  view: Pick<BacklogMappingsView, 'assignee'>,
  skip: ReadonlySet<string> = new Set(),
): InviteDraft[] {
  return view.assignee
    .filter((row) => {
      if (row.userId || skip.has(row.from)) return false;
      const name = agentNameFrom(row.from);
      return !name || !looksLikeAgent(name);
    })
    .map((row) => ({ from: row.from, count: row.count }));
}

const n = (value: number) => value.toLocaleString('en-US');

/**
 * Hint under the email field of the invite dialog. Edit mappings has no counts before the first
 * read, so a count of 0 is left out rather than claiming no task carries the value.
 */
export function inviteHint(draft: InviteDraft): string {
  if (!draft.count) return `For ${draft.from} in the files.`;
  return `For ${draft.from} in the files (${n(draft.count)} ${draft.count === 1 ? 'task' : 'tasks'}).`;
}
