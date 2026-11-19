import type { BacklogMappingsView } from '@zamu/contracts';
import {
  normalizeName as coreNormalizeName,
  type MemberCandidate,
  matchAssigneeByName,
} from '@zamu/core/backlog/mappings';
import { describe, expect, it } from 'vitest';
import {
  inviteHint,
  inviteSuggestions,
  matchMemberByName,
  nameMatches,
  normalizeName,
} from './assignee-hints';

// The name match mirrors core's matchAssigneeByName: same members and values as core's
// mappings.test.ts, and both functions must agree on every case.
const CORE_MEMBERS: MemberCandidate[] = [
  { id: 'u-ana', name: 'Ana Ruiz', kind: 'person', email: 'ana@example.com' },
  { id: 'u-tomas', name: 'Tomás Berg', kind: 'person', email: 'tberg@example.com' },
  { id: 'u-claude', name: 'claude-dev', kind: 'agent', email: 'claude-dev@agents.local' },
  { id: 'u-sam1', name: 'Sam', kind: 'person', email: 'sam.one@example.com' },
  { id: 'u-sam2', name: 'Sam', kind: 'person', email: 'sam.two@example.com' },
];

const CORE_CASES: [string, string | null][] = [
  ['@Ana Ruiz', 'u-ana'],
  ['@ana', 'u-ana'],
  ['tberg', 'u-tomas'],
  ['@claude-dev', 'u-claude'],
  ['@claude_dev', 'u-claude'],
  ['@sam', null],
  ['@francis', null],
  ['@', null],
];

const row = (from: string, count: number, userId: string | null = null) => ({
  from,
  userId,
  how: userId ? ('name' as const) : ('fallback' as const),
  count,
  user: null,
});

function view(assignee: BacklogMappingsView['assignee']): Pick<BacklogMappingsView, 'assignee'> {
  return { assignee };
}

describe('normalizeName', () => {
  it('agrees with core', () => {
    for (const value of [' In_Progress ', 'Won’t do', 'Ana  Ruiz', 'claude-dev', '‘quoted’', '']) {
      expect(normalizeName(value), value).toBe(coreNormalizeName(value));
    }
  });
});

describe('matchMemberByName', () => {
  it("matches core's cases the same way", () => {
    for (const [value, expected] of CORE_CASES) {
      expect(matchAssigneeByName(value, CORE_MEMBERS), `core ${value}`).toBe(expected);
      expect(matchMemberByName(value, CORE_MEMBERS)?.id ?? null, `web ${value}`).toBe(expected);
    }
  });

  it('matches agents by name when the members list hides their email', () => {
    const members = CORE_MEMBERS.map((member) =>
      member.kind === 'agent' ? { ...member, email: null } : member,
    );
    expect(matchMemberByName('@claude-dev', members)?.id).toBe('u-claude');
    expect(matchMemberByName('@Claude Dev', members)?.id).toBe('u-claude');
  });

  it('counts a member matching by name and by email once', () => {
    const ana = { id: 'u-ana', name: 'ana', kind: 'person' as const, email: 'ana@example.com' };
    expect(matchMemberByName('@ana', [ana])).toBe(ana);
  });
});

describe('nameMatches', () => {
  it('lists No one rows that one member matches, in table order', () => {
    const matches = nameMatches(
      view([row('@tberg', 3), row('@ana', 64, 'u-ana'), row('@sam', 2), row('@Ana Ruiz', 1)]),
      CORE_MEMBERS,
    );
    expect(matches.map((m) => [m.from, m.member.id])).toEqual([
      ['@tberg', 'u-tomas'],
      ['@Ana Ruiz', 'u-ana'],
    ]);
  });
});

describe('inviteSuggestions', () => {
  it('lists unmatched values that do not look like agents', () => {
    const drafts = inviteSuggestions(
      view([row('@claude', 219), row('@francis', 5), row('@ana', 64, 'u-ana'), row('Lee Chen', 1)]),
    );
    expect(drafts).toEqual([
      { from: '@francis', count: 5 },
      { from: 'Lee Chen', count: 1 },
    ]);
  });

  it('leaves rows a member matches by name', () => {
    expect(inviteSuggestions(view([row('@tberg', 3)]), new Set(['@tberg']))).toEqual([]);
  });

  it('keeps values that give no agent name', () => {
    expect(inviteSuggestions(view([row('@x', 2)]))).toEqual([{ from: '@x', count: 2 }]);
  });
});

describe('inviteHint', () => {
  it('names the value and its tasks', () => {
    expect(inviteHint({ from: '@francis', count: 5 })).toBe('For @francis in the files (5 tasks).');
    expect(inviteHint({ from: '@lee', count: 1 })).toBe('For @lee in the files (1 task).');
    expect(inviteHint({ from: '@many', count: 1200 })).toBe('For @many in the files (1,200 tasks).');
    // Edit mappings before the first read: no counts yet.
    expect(inviteHint({ from: '@lee', count: 0 })).toBe('For @lee in the files.');
  });
});
