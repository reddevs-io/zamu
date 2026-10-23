import type { Member, ReviewItem } from '@pm/contracts';
import { describe, expect, it } from 'vitest';
import {
  cycleEnds,
  deadlinePill,
  entryId,
  excerptParts,
  keepHeldRows,
  type QueueEntry,
  shortAgo,
  silenceAge,
  sinceText,
  stepFocus,
  waitAge,
  workspaceLine,
} from './model';
import { parseDashboardSearch, scopeOf } from './search';

const NOW = Date.parse('2026-10-23T12:00:00.000Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

function review(key: string): QueueEntry {
  const item = {
    task: {
      key,
      title: key,
      status: 'in_review',
      priority: 'none',
      project: { key: 'PAY', name: 'Payments' },
    },
    assignee: null,
    since: ago(HOUR),
  } satisfies ReviewItem;
  return { group: 'review', item, id: entryId({ group: 'review', item }) };
}

describe('dashboard search', () => {
  it('keeps known values only', () => {
    expect(parseDashboardSearch({ scope: 'everyone', open: 'mentions', task: 'pay-140' })).toEqual({
      scope: 'everyone',
      open: 'mentions',
      task: 'PAY-140',
    });
    expect(parseDashboardSearch({ scope: 'mine', open: 'other', task: 'nope' })).toEqual({});
    expect(scopeOf({})).toBe('mine');
    expect(scopeOf({ scope: 'everyone' })).toBe('everyone');
  });
});

describe('short texts', () => {
  it('formats waits, silences and ages', () => {
    expect(waitAge(ago(40 * MIN), NOW)).toBe('40m');
    expect(waitAge(ago(10_000), NOW)).toBe('1m');
    expect(waitAge(ago(3 * HOUR), NOW)).toBe('3h');
    expect(waitAge(ago(DAY + HOUR), NOW)).toBe('1d');
    expect(silenceAge(ago(26 * HOUR), NOW)).toBe('26h');
    expect(silenceAge(ago(47 * HOUR), NOW)).toBe('47h');
    expect(silenceAge(ago(6 * DAY), NOW)).toBe('6d');
    expect(shortAgo(ago(25 * MIN), NOW)).toBe('25m');
    expect(shortAgo(ago(5_000), NOW)).toBe('now');
    expect(sinceText(ago(40 * MIN), NOW)).toBe('40m ago');
    expect(sinceText(ago(30 * HOUR), NOW)).toBe('yesterday');
    expect(sinceText(ago(3 * DAY), NOW)).toBe('3d ago');
    expect(sinceText(ago(10_000), NOW)).toBe('just now');
  });

  it('names deadlines', () => {
    expect(cycleEnds(1)).toBe('ends today');
    expect(cycleEnds(2)).toBe('ends tomorrow');
    expect(cycleEnds(3)).toBe('ends in 2 days');
    const milestone = {
      kind: 'milestone' as const,
      project: { key: 'PAY', name: 'Payments' },
      milestone: { id: 'm1', name: 'PCI audit', targetDate: '2026-10-12' },
      openTasks: 4,
      progress: { done: 7, total: 11 },
    };
    expect(deadlinePill({ ...milestone, daysOverdue: 11 })).toBe('11 days overdue');
    expect(deadlinePill({ ...milestone, daysOverdue: 1 })).toBe('1 day overdue');
  });

  it('describes the workspace per scope', () => {
    const member = (id: string, kind: 'person' | 'agent', responsible?: string) =>
      ({
        id,
        name: id,
        kind,
        responsible: responsible ? { id: responsible, name: responsible, kind: 'person' } : null,
      }) as Member;
    const members = [
      member('ana', 'person'),
      member('tomas', 'person'),
      member('lina', 'person'),
      member('claude-dev', 'agent', 'ana'),
      member('claude-docs', 'agent', 'ana'),
      member('codex-ci', 'agent', 'tomas'),
      member('gemini', 'agent', 'lina'),
    ];
    expect(workspaceLine('Reddevs', 'mine', members, 'ana')).toBe('Reddevs · you and 2 agents');
    expect(workspaceLine('Reddevs', 'everyone', members, 'ana')).toBe('Reddevs · 3 people, 4 agents');
    expect(workspaceLine('Reddevs', 'mine', members, 'lina')).toBe('Reddevs · you and 1 agent');
    expect(workspaceLine('Reddevs', 'mine', [members[0] as Member], 'ana')).toBe('Reddevs · you');
    expect(workspaceLine('Reddevs', 'mine', undefined, 'ana')).toBe('Reddevs');
  });
});

describe('excerptParts', () => {
  it('marks mentions and inline code', () => {
    expect(excerptParts('@Ana Ruiz pg-boss drops `retryLimit: 5` jobs', ['Ana', 'Ana Ruiz'])).toEqual([
      { type: 'mention', value: 'Ana Ruiz' },
      { type: 'text', value: ' pg-boss drops ' },
      { type: 'code', value: 'retryLimit: 5' },
      { type: 'text', value: ' jobs' },
    ]);
  });

  it('keeps an unmatched backtick and unknown names as text', () => {
    expect(excerptParts('cost is `5 for @Bob', ['Ana Ruiz'])).toEqual([
      { type: 'text', value: 'cost is ' },
      { type: 'text', value: '`5 for @Bob' },
    ]);
  });
});

describe('keepHeldRows', () => {
  const [a, b, c] = [review('PAY-1'), review('PAY-2'), review('PAY-3')] as [
    QueueEntry,
    QueueEntry,
    QueueEntry,
  ];

  it('puts a held row that left back in its place, faded', () => {
    const kept = keepHeldRows([a, b, c], [a, c], new Set([b.id]));
    expect(kept.map((entry) => [entry.id, entry.gone ?? false])).toEqual([
      [a.id, false],
      [b.id, true],
      [c.id, false],
    ]);
  });

  it('drops it once nothing holds it, and never resurrects rows the answer still has', () => {
    expect(
      keepHeldRows([a, { ...b, gone: true }, c], [a, c], new Set([a.id])).map((entry) => entry.id),
    ).toEqual([a.id, c.id]);
    expect(keepHeldRows([a, b, c], [a], new Set([c.id]), new Set([a.id, b.id, c.id]))).toEqual([a]);
  });
});

describe('stepFocus', () => {
  const groups = [
    { group: 'review' as const, rows: [{ id: 'r1' }, { id: 'r2' }] },
    { group: 'mentions' as const, rows: [] },
    { group: 'stalled' as const, rows: [{ id: 's1' }] },
    { group: 'deadlines' as const, rows: [] },
  ];

  it('crosses groups and stops at the ends', () => {
    expect(stepFocus(groups, null, 1)).toBe('r1');
    expect(stepFocus(groups, null, -1)).toBe('s1');
    expect(stepFocus(groups, 'r2', 1)).toBe('s1');
    expect(stepFocus(groups, 's1', 1)).toBe('s1');
    expect(stepFocus(groups, 'r1', -1)).toBe('r1');
  });

  it('moves from an empty group header to the rows around it', () => {
    expect(stepFocus(groups, 'header:mentions', 1)).toBe('s1');
    expect(stepFocus(groups, 'header:mentions', -1)).toBe('r2');
    expect(stepFocus(groups, 'header:deadlines', 1)).toBe('header:deadlines');
  });
});
