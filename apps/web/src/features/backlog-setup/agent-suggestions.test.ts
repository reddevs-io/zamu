import type { BacklogMappingsView } from '@pm/contracts';
import { describe, expect, it } from 'vitest';
import { agentNameFrom, agentSuggestions, assignAgent, looksLikeAgent } from './agent-suggestions';

const ANA = { id: '01a169ed-a7a5-712d-a08b-1e796a1ac801', name: 'Ana Ruiz', kind: 'person' as const };
const NEW_AGENT = '01a169ed-a7a5-712d-a08b-1e796a1ac8ff';

function view(assignee: BacklogMappingsView['assignee']): BacklogMappingsView {
  return { status: [], priority: [], assignee };
}

const row = (from: string, count: number, userId: string | null = null) => ({
  from,
  userId,
  how: userId ? ('name' as const) : ('fallback' as const),
  count,
  user: null,
});

describe('agentNameFrom', () => {
  it('turns an assignee value into a valid agent name', () => {
    expect(agentNameFrom('@claude')).toBe('claude');
    expect(agentNameFrom('@@Claude Code')).toBe('claude-code');
    expect(agentNameFrom('claude_code[bot]')).toBe('claude-code-bot');
    expect(agentNameFrom('  @GitHub Copilot  ')).toBe('github-copilot');
  });

  it('gives up when nothing usable is left', () => {
    expect(agentNameFrom('@')).toBeNull();
    expect(agentNameFrom('@x')).toBeNull();
    expect(agentNameFrom('@✨')).toBeNull();
  });

  it('keeps names within 64 characters without a trailing dash', () => {
    const name = agentNameFrom(`@${'a'.repeat(63)} b`);
    expect(name).toBe('a'.repeat(63));
  });
});

describe('looksLikeAgent', () => {
  it('matches known coding agents as whole words', () => {
    for (const name of ['claude', 'claude-code', 'github-copilot', 'codex-cli', 'gemini', 'opencode']) {
      expect(looksLikeAgent(name), name).toBe(true);
    }
  });

  it('leaves people and partial words alone', () => {
    for (const name of ['francis', 'ana', 'claudette', 'cursory', 'example']) {
      expect(looksLikeAgent(name), name).toBe(false);
    }
  });
});

describe('agentSuggestions', () => {
  it('suggests unmatched agent-looking values, most tasks first', () => {
    const suggestions = agentSuggestions(
      view([row('@copilot', 12), row('@ana', 64, ANA.id), row('@claude', 219), row('@francis', 5)]),
      [ANA],
    );
    expect(suggestions).toEqual([
      { name: 'claude', from: ['@claude'], count: 219 },
      { name: 'copilot', from: ['@copilot'], count: 12 },
    ]);
  });

  it('groups spellings of the same name and skips names an agent already has', () => {
    const suggestions = agentSuggestions(
      view([row('@claude-code', 3), row('@Claude_Code', 2), row('@codex', 9)]),
      [ANA, { name: 'codex', kind: 'agent' }],
    );
    expect(suggestions).toEqual([{ name: 'claude-code', from: ['@claude-code', '@Claude_Code'], count: 5 }]);
  });

  it('leaves rows that already map to someone', () => {
    expect(agentSuggestions(view([row('@claude', 219, ANA.id)]), [ANA])).toEqual([]);
  });
});

describe('assignAgent', () => {
  it('maps the given values to the new agent as picks by hand', () => {
    const next = assignAgent(
      view([row('@claude', 219), row('@Claude', 1), row('@francis', 5)]),
      ['@claude', '@Claude'],
      NEW_AGENT,
    );
    expect(next.assignee).toEqual([
      { from: '@claude', userId: NEW_AGENT, how: 'manual', count: 219, user: null },
      { from: '@Claude', userId: NEW_AGENT, how: 'manual', count: 1, user: null },
      row('@francis', 5),
    ]);
  });
});
