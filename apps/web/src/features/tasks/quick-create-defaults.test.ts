import type { Cycle, MilestoneWithProgress } from '@pm/contracts';
import { describe, expect, it } from 'vitest';
import { describeActivity, describeCycleEnded, formatDateRange } from './format';
import { planningDefaultsFrom, resolveCycleDefault, resolveMilestoneDefault } from './quick-create-defaults';

const ID = '01a16813-cf40-775e-8418-cf222382cc88';

describe('quick create defaults', () => {
  it('reads the milestone and cycle pages', () => {
    expect(planningDefaultsFrom(`/p/PAY/milestones/${ID}`, {})).toEqual({
      projectKey: 'PAY',
      milestoneId: ID,
    });
    expect(planningDefaultsFrom('/p/PAY/cycles/12', {})).toEqual({ projectKey: 'PAY', cycle: 12 });
    expect(planningDefaultsFrom('/p/PAY/cycles/current', { milestone: ID })).toEqual({
      projectKey: 'PAY',
      milestoneId: ID,
      cycle: 'current',
    });
  });

  it('reads single-value list and board filters, not "none" or several values', () => {
    expect(planningDefaultsFrom('/p/PAY', { milestone: ID, cycle: 'next' })).toEqual({
      projectKey: 'PAY',
      milestoneId: ID,
      cycle: 'next',
    });
    expect(planningDefaultsFrom('/p/PAY', { milestone: 'none', cycle: 'none' })).toEqual({
      projectKey: 'PAY',
    });
    expect(planningDefaultsFrom('/p/PAY', { cycle: '12,13' })).toEqual({ projectKey: 'PAY' });
    expect(planningDefaultsFrom('/p/PAY', { cycle: 13 })).toEqual({ projectKey: 'PAY', cycle: 13 });
    expect(planningDefaultsFrom('/my-tasks', { cycle: 13 })).toEqual({});
  });

  it('resolves to open milestones and cycles only', () => {
    const milestone = (id: string, status: MilestoneWithProgress['status']) =>
      ({ id, status }) as MilestoneWithProgress;
    expect(resolveMilestoneDefault([milestone(ID, 'active')], ID)?.id).toBe(ID);
    expect(resolveMilestoneDefault([milestone(ID, 'completed')], ID)).toBeUndefined();

    const cycle = (number: number, state: Cycle['state']) => ({ id: `c${number}`, number, state }) as Cycle;
    const cycles = [
      cycle(11, 'completed'),
      cycle(12, 'current'),
      cycle(13, 'upcoming'),
      cycle(14, 'upcoming'),
    ];
    expect(resolveCycleDefault(cycles, 'current')?.number).toBe(12);
    expect(resolveCycleDefault(cycles, 'next')?.number).toBe(13);
    expect(resolveCycleDefault(cycles, 14)?.number).toBe(14);
    expect(resolveCycleDefault(cycles, 11)).toBeUndefined();
    expect(resolveCycleDefault(cycles, undefined)).toBeUndefined();
  });
});

describe('cycle wording', () => {
  const ref = (number: number) => ({ id: `00000000-0000-4000-8000-0000000000${number}`, number, name: null });

  it('describes the system entry when a cycle ends', () => {
    const changes = [{ field: 'cycle' as const, from: ref(12), to: ref(13) }];
    expect(describeCycleEnded({ changes })).toBe('Cycle 12 ended. Moved to Cycle 13.');
    expect(describeCycleEnded({ changes: [{ field: 'cycle', from: ref(12), to: null }] })).toBe(
      'Cycle 12 ended. Taken out of the cycle.',
    );
    expect(describeActivity({ type: 'cycle.ended', changes })).toBe(
      'ended Cycle 12 and moved it to Cycle 13',
    );
  });

  it('formats calendar date ranges without shifting days', () => {
    const now = new Date(2026, 9, 23);
    expect(formatDateRange('2026-10-26', '2026-11-08', now)).toBe('Oct 26 – Nov 8');
    expect(formatDateRange('2026-12-28', '2027-01-10', now)).toBe('Dec 28 – Jan 10, 2027');
  });
});
