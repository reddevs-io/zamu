import { describe, expect, it } from 'vitest';
import {
  emptySeenValues,
  MappingIndex,
  type MemberCandidate,
  mappingsView,
  matchAssigneeByName,
  matchPriorityByName,
  matchStatusByName,
  normalizeName,
  prefillMappings,
} from './mappings';

const members: MemberCandidate[] = [
  { id: 'u-ana', name: 'Ana Ruiz', kind: 'person', email: 'ana@example.com' },
  { id: 'u-tomas', name: 'Tomás Berg', kind: 'person', email: 'tberg@example.com' },
  { id: 'u-claude', name: 'claude-dev', kind: 'agent', email: 'claude-dev@agents.local' },
  { id: 'u-sam1', name: 'Sam', kind: 'person', email: 'sam.one@example.com' },
  { id: 'u-sam2', name: 'Sam', kind: 'person', email: 'sam.two@example.com' },
];

describe('matching by name', () => {
  it('normalises case, spaces, dashes, underscores and curly apostrophes', () => {
    expect(normalizeName(' In_Progress ')).toBe('inprogress');
    expect(normalizeName('Won’t do')).toBe("won'tdo");
  });

  it('matches statuses by name and by keyword', () => {
    expect(matchStatusByName('To Do')).toBe('todo');
    expect(matchStatusByName('todo')).toBe('todo');
    expect(matchStatusByName('In Progress')).toBe('in_progress');
    expect(matchStatusByName('Doing')).toBe('in_progress');
    expect(matchStatusByName('Code review')).toBe('in_review');
    expect(matchStatusByName('In Review')).toBe('in_review');
    expect(matchStatusByName('Done')).toBe('done');
    expect(matchStatusByName('Completed')).toBe('done');
    expect(matchStatusByName('Cancelled')).toBe('canceled');
    expect(matchStatusByName('Won’t do')).toBe('canceled');
    expect(matchStatusByName('Icebox')).toBe('backlog');
    expect(matchStatusByName('Backlog')).toBe('backlog');
    expect(matchStatusByName('Blocked')).toBeNull();
  });

  it('matches priorities by name', () => {
    expect(matchPriorityByName('high')).toBe('high');
    expect(matchPriorityByName('Medium')).toBe('medium');
    expect(matchPriorityByName('LOW')).toBe('low');
    expect(matchPriorityByName('urgent')).toBe('urgent');
    expect(matchPriorityByName('p1')).toBeNull();
  });

  it('matches assignees by name, agent name and email local part', () => {
    expect(matchAssigneeByName('@Ana Ruiz', members)).toBe('u-ana');
    expect(matchAssigneeByName('@ana', members)).toBe('u-ana');
    expect(matchAssigneeByName('tberg', members)).toBe('u-tomas');
    expect(matchAssigneeByName('@claude-dev', members)).toBe('u-claude');
    expect(matchAssigneeByName('@claude_dev', members)).toBe('u-claude');
    // Two members named Sam: ambiguous, no match.
    expect(matchAssigneeByName('@sam', members)).toBeNull();
    expect(matchAssigneeByName('@francis', members)).toBeNull();
    expect(matchAssigneeByName('@', members)).toBeNull();
  });
});

describe('prefillMappings', () => {
  it('maps every value seen by name and falls back for the rest', () => {
    const seen = emptySeenValues();
    seen.status.declare('To Do');
    seen.status.add('In Progress');
    seen.status.add('Blocked');
    seen.status.add('blocked');
    seen.priority.add('high');
    seen.priority.add('p1');
    seen.assignee.add('@ana');
    seen.assignee.add('@francis');
    const mappings = prefillMappings(seen, members);
    expect(mappings.status).toEqual([
      { from: 'To Do', to: 'todo', how: 'name' },
      { from: 'In Progress', to: 'in_progress', how: 'name' },
      { from: 'Blocked', to: 'todo', how: 'fallback' },
    ]);
    expect(mappings.priority).toEqual([
      { from: 'high', to: 'high', how: 'name' },
      { from: 'p1', to: 'none', how: 'fallback' },
    ]);
    expect(mappings.assignee).toEqual([
      { from: '@ana', userId: 'u-ana', how: 'name' },
      { from: '@francis', userId: null, how: 'fallback' },
    ]);
    expect(seen.status.count('BLOCKED')).toBe(2);
  });

  it('keeps existing rows, including values no longer seen', () => {
    const seen = emptySeenValues();
    seen.status.add('Blocked');
    const mappings = prefillMappings(seen, members, {
      status: [
        { from: 'blocked', to: 'in_progress', how: 'manual' },
        { from: 'Gone', to: 'done', how: 'manual' },
      ],
      priority: [],
      assignee: [],
    });
    expect(mappings.status).toEqual([
      { from: 'blocked', to: 'in_progress', how: 'manual' },
      { from: 'Gone', to: 'done', how: 'manual' },
    ]);
  });
});

describe('MappingIndex', () => {
  const index = new MappingIndex(
    {
      status: [
        { from: 'To Do', to: 'todo', how: 'name' },
        { from: 'Blocked', to: 'todo', how: 'fallback' },
      ],
      priority: [{ from: 'high', to: 'high', how: 'name' }],
      assignee: [
        { from: '@ana', userId: 'u-ana', how: 'name' },
        { from: '@gone', userId: 'u-gone', how: 'manual' },
        { from: '@bot', userId: null, how: 'manual' },
      ],
    },
    new Set(['u-ana']),
  );

  it('looks values up ignoring case and reports fallbacks', () => {
    expect(index.status('to do')).toEqual({ value: 'todo', fellBack: false });
    expect(index.status('Blocked')).toEqual({ value: 'todo', fellBack: true });
    expect(index.status('Unknown')).toEqual({ value: 'todo', fellBack: true });
    expect(index.priority('HIGH')).toEqual({ value: 'high', fellBack: false });
    expect(index.priority('p1')).toEqual({ value: 'none', fellBack: true });
  });

  it('treats users outside the workspace as no one, and a manual no one as chosen', () => {
    expect(index.assignee('@ana')).toEqual({ value: 'u-ana', fellBack: false });
    expect(index.assignee('@gone')).toEqual({ value: null, fellBack: true });
    expect(index.assignee('@bot')).toEqual({ value: null, fellBack: false });
    expect(index.assignee('@nobody')).toEqual({ value: null, fellBack: true });
  });
});

describe('mappingsView', () => {
  it('adds counts, users and fallback rows for values without a row', () => {
    const seen = emptySeenValues();
    seen.status.add('Done');
    seen.status.add('Done');
    seen.status.add('Blocked');
    seen.assignee.add('@ana');
    const view = mappingsView(
      {
        status: [{ from: 'done', to: 'done', how: 'name' }],
        priority: [],
        assignee: [{ from: '@ana', userId: 'u-ana', how: 'name' }],
      },
      seen,
      new Map([['u-ana', { id: 'u-ana', name: 'Ana Ruiz', kind: 'person' as const }]]),
    );
    expect(view.status).toEqual([
      { from: 'done', to: 'done', how: 'name', count: 2 },
      { from: 'Blocked', to: 'todo', how: 'fallback', count: 1 },
    ]);
    expect(view.assignee[0]?.user?.name).toBe('Ana Ruiz');
  });
});
