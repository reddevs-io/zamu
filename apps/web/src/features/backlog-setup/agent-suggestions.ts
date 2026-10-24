import { AGENT_NAME_PATTERN, type BacklogMappingsView, type Member } from '@pm/contracts';

// Assignee values that name a coding agent with no member here ("@claude" with no agent called
// claude). The Mappings step suggests creating the agent; the Add agent dialog takes the name.

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
 * first. Names an existing agent already has are left out: creating it again would fail.
 */
export function agentSuggestions(
  view: Pick<BacklogMappingsView, 'assignee'>,
  members: readonly Pick<Member, 'name' | 'kind'>[],
): AgentSuggestion[] {
  const taken = new Set(members.filter((m) => m.kind === 'agent').map((m) => m.name.toLowerCase()));
  const byName = new Map<string, AgentSuggestion>();
  for (const row of view.assignee) {
    if (row.userId) continue;
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

/** Maps the given assignee values to a new agent, as picks made by hand. */
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
