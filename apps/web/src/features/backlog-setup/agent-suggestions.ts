import { AGENT_NAME_PATTERN, type BacklogMappingsView, type Member } from '@zamu/contracts';

// Assignee values that name a coding agent with no member here ("@claude" with no agent called
// claude). The Mappings step suggests creating the agent; the Add agent dialog takes the name. When
// an agent with a similar name exists ("claude-dev" for "@claude"), it suggests mapping to it too.

/** Coding agents that commonly write Backlog.md files. A value matches when one of its words is listed. */
export const KNOWN_AGENTS: readonly string[] = [
  'aider',
  'amp',
  'claude',
  'cline',
  'codex',
  'copilot',
  'cursor',
  'devin',
  'gemini',
  'goose',
  'jules',
  'junie',
  'kiro',
  'openhands',
  'opencode',
  'qwen',
  'windsurf',
];

const MAX_AGENT_NAME = 64;

/**
 * The agent name an assignee value turns into: "@Claude Code" becomes "claude-code". Null when
 * nothing usable is left (agent names need at least 2 lowercase letters or digits).
 */
export function agentNameFrom(value: string): string | null {
  const name = value
    .replace(/^@+/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_AGENT_NAME)
    .replace(/-+$/, '');
  return name.length >= 2 && AGENT_NAME_PATTERN.test(name) ? name : null;
}

/** True when the name (as agentNameFrom returns it) contains a known coding agent as a word. */
export function looksLikeAgent(name: string): boolean {
  return name.split('-').some((word) => KNOWN_AGENTS.includes(word));
}

export interface AgentSuggestion {
  /** Agent name for the Add agent dialog. */
  name: string;
  /** Assignee values (as in the files) the new agent should map. */
  from: string[];
  /** Tasks carrying those values. */
  count: number;
}

/** The agent to create for one unmatched row, when it can have a valid name. */
export function agentDraftFor(from: string): AgentSuggestion | null {
  const name = agentNameFrom(from);
  return name ? { name, from: [from], count: 0 } : null;
}

/**
 * Unmatched assignee rows that look like coding agents, one suggestion per agent name, most tasks
 * first. Names an existing agent already has are left out: creating it again would fail. Rows in
 * `skip` (a member matches them by name) are left out too.
 */
export function agentSuggestions(
  view: Pick<BacklogMappingsView, 'assignee'>,
  members: readonly Pick<Member, 'name' | 'kind'>[],
  skip: ReadonlySet<string> = new Set(),
): AgentSuggestion[] {
  const taken = new Set(members.filter((m) => m.kind === 'agent').map((m) => m.name.toLowerCase()));
  const byName = new Map<string, AgentSuggestion>();
  for (const row of view.assignee) {
    if (row.userId || skip.has(row.from)) continue;
    const name = agentNameFrom(row.from);
    if (!name || taken.has(name) || !looksLikeAgent(name)) continue;
    const found = byName.get(name);
    if (found) {
      found.from.push(row.from);
      found.count += row.count;
    } else {
      byName.set(name, { name, from: [row.from], count: row.count });
    }
  }
  return [...byName.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** Most similar agents offered for one value: "Map to …" buttons and select options. */
export const MAX_SIMILAR_AGENTS = 3;

/** A member as the agent and name suggestions see it. `joinedAt` orders similar agents. */
export type SuggestionMember = Pick<Member, 'id' | 'name' | 'kind'> &
  Partial<Pick<Member, 'email' | 'joinedAt'>>;

/**
 * Existing agents whose name shares a known coding agent word with `name` (an agentNameFrom result):
 * "claude-dev" for "claude", "claude-ci" for "claude-code". The agent named exactly `name` is not
 * one: core maps it by name. At most three, most recently added first.
 */
export function similarAgents<M extends SuggestionMember>(name: string, members: readonly M[]): M[] {
  const words = new Set(name.split('-').filter((word) => KNOWN_AGENTS.includes(word)));
  if (!words.size) return [];
  const added = (member: M) => (member.joinedAt ? Date.parse(member.joinedAt) : 0);
  return members
    .filter(
      (member) =>
        member.kind === 'agent' &&
        member.name.toLowerCase() !== name &&
        member.name
          .toLowerCase()
          .split('-')
          .some((word) => words.has(word)),
    )
    .sort((a, b) => added(b) - added(a) || a.name.localeCompare(b.name))
    .slice(0, MAX_SIMILAR_AGENTS);
}

/** Maps the given assignee values to an agent (new or similar), as picks made by hand. */
export function assignAgent(
  view: BacklogMappingsView,
  from: readonly string[],
  userId: string,
): BacklogMappingsView {
  return {
    ...view,
    assignee: view.assignee.map((row) =>
      from.includes(row.from) ? { ...row, userId, user: null, how: 'manual' } : row,
    ),
  };
}
