import { describe, expect, it } from 'vitest';
import {
  addDays,
  daysBetween,
  describeEnd,
  describeStart,
  describeTarget,
  endOfMonth,
  endOfQuarter,
  formatDay,
  formatLength,
  formatLengthSentence,
  formatRange,
  formatWeekdayDay,
  lengthInDays,
  localDay,
  monthGrid,
  nextMonday,
  planningToday,
} from './dates';

describe('calendar arithmetic', () => {
  it('adds days across months and years', () => {
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(daysBetween('2026-10-23', '2026-11-09')).toBe(17);
    expect(lengthInDays('2026-10-12', '2026-10-25')).toBe(14);
  });

  it('finds next Monday strictly after a day, like core', () => {
    expect(nextMonday('2026-10-23')).toBe('2026-10-26'); // Friday
    expect(nextMonday('2026-10-26')).toBe('2026-11-02'); // Monday: the next one
    expect(nextMonday('2026-10-25')).toBe('2026-10-26'); // Sunday
  });

  it('computes month and quarter ends', () => {
    expect(endOfMonth('2026-02-10')).toBe('2026-02-28');
    expect(endOfMonth('2026-12-12')).toBe('2026-12-31');
    expect(endOfQuarter('2026-10-23')).toBe('2026-12-31');
    expect(endOfQuarter('2026-05-01')).toBe('2026-06-30');
  });

  it('takes the server day from the current cycle when there is one', () => {
    const now = Date.parse('2026-10-24T01:00:00Z');
    expect(planningToday(now, { endsOn: '2026-10-25', daysLeft: 3 })).toBe('2026-10-23');
    // Without a current cycle: the browser's day.
    expect(planningToday(now, { endsOn: '2026-10-25', daysLeft: 3, state: 'upcoming' })).toBe(localDay(now));
    expect(planningToday(now, null)).toBe(localDay(now));
  });
});

describe('month grid', () => {
  it('starts on Monday and pads with neighbouring days (December 2026, frame 16)', () => {
    const weeks = monthGrid(2026, 11);
    expect(weeks).toHaveLength(5);
    expect(weeks[0]?.[0]).toEqual({ date: '2026-11-30', day: 30, inMonth: false });
    expect(weeks[0]?.[1]).toEqual({ date: '2026-12-01', day: 1, inMonth: true });
    expect(weeks[4]?.map((cell) => cell.day)).toEqual([28, 29, 30, 31, 1, 2, 3]);
  });

  it('uses six rows when the month needs them', () => {
    // August 2026 starts on a Saturday and has 31 days.
    expect(monthGrid(2026, 7)).toHaveLength(6);
  });
});

describe('formatting', () => {
  it('formats days with the year only outside the current one', () => {
    expect(formatDay('2026-10-20', '2026-10-23')).toBe('Oct 20');
    expect(formatDay('2027-01-30', '2026-10-23')).toBe('Jan 30, 2027');
    expect(formatRange('2026-10-12', '2026-10-25')).toBe('Oct 12 – Oct 25');
    expect(formatWeekdayDay('2026-11-23')).toBe('Mon, Nov 23');
  });

  it('describes lengths', () => {
    expect(formatLength(14)).toBe('2 weeks');
    expect(formatLength(7)).toBe('1 week');
    expect(formatLength(10)).toBe('10 days');
    expect(formatLength(1)).toBe('1 day');
    expect(formatLengthSentence(14)).toBe('Two weeks');
  });

  it('describes a milestone target', () => {
    expect(describeTarget(22)).toEqual({ text: '22 days left', overdue: false });
    expect(describeTarget(1)).toEqual({ text: '1 day left', overdue: false });
    expect(describeTarget(0)).toEqual({ text: 'Due today', overdue: false });
    expect(describeTarget(-3)).toEqual({ text: '3 days overdue', overdue: true });
  });

  it('describes when a cycle starts and ends (frame 22)', () => {
    const today = '2026-10-23';
    expect(describeStart('2026-10-26', today)).toBe('Starts Monday');
    expect(describeStart('2026-11-09', today)).toBe('Starts in 17 days');
    expect(describeStart('2026-10-24', today)).toBe('Starts tomorrow');
    expect(describeEnd('2026-10-25', today)).toBe('ends Sunday');
    expect(describeEnd('2026-10-23', today)).toBe('ends today');
    expect(describeEnd('2026-11-25', today)).toBe('ends Nov 25');
  });
});
