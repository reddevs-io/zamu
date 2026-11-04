import { describe, expect, it } from 'vitest';
import { formatDayWithWeekday, parseDueText, quickPicks, relativeDay } from './dates';
import { describeChange } from './describe';

// 2026-11-03 is a Tuesday, as in frame 074.
const TODAY = '2026-11-03';

describe('typed due dates', () => {
  it.each([
    ['today', '2026-11-03'],
    ['tomorrow', '2026-11-04'],
    ['tmr', '2026-11-04'],
    ['yesterday', '2026-11-02'],
    ['+3d', '2026-11-06'],
    ['+2w', '2026-11-17'],
    ['+1m', '2026-12-03'],
    ['in 2 weeks', '2026-11-17'],
    ['in 3 days', '2026-11-06'],
    ['fri', '2026-11-06'],
    ['friday', '2026-11-06'],
    ['tue', '2026-11-10'],
    ['next week', '2026-11-09'],
    ['nov 4', '2026-11-04'],
    ['Nov 4', '2026-11-04'],
    ['november 4th', '2026-11-04'],
    ['4 nov', '2026-11-04'],
    ['nov 4, 2027', '2027-11-04'],
    ['oct 31', '2026-10-31'],
    ['feb 2', '2027-02-02'],
    ['aug 1', '2027-08-01'],
    ['2026-11-04', '2026-11-04'],
  ])('reads %s', (text, expected) => {
    expect(parseDueText(text, TODAY)).toBe(expected);
  });

  it.each(['', 'soon', 'feb 30', '2026-13-01', 'nov', '+3x', 'n 4'])('refuses %j', (text) => {
    expect(parseDueText(text, TODAY)).toBeNull();
  });

  it('offers Today, Tomorrow and the coming Monday', () => {
    expect(quickPicks(TODAY).map((pick) => [pick.label, formatDayWithWeekday(pick.date, TODAY)])).toEqual([
      ['Today', 'Tue, Nov 3'],
      ['Tomorrow', 'Wed, Nov 4'],
      ['Next week', 'Mon, Nov 9'],
    ]);
    // On a Monday, next week is the Monday after.
    expect(quickPicks('2026-11-09')[2]?.date).toBe('2026-11-16');
    expect(relativeDay('2026-11-06', TODAY)).toBe('In 3 days');
    expect(relativeDay('2026-10-31', TODAY)).toBe('3 days ago');
  });
});

describe('change sentences', () => {
  it('says what changed for one task or several', () => {
    expect(describeChange('HBR-71', { status: 'in_review' })).toBe('Moved HBR-71 to In review');
    expect(describeChange('3 tasks', { priority: 'high' })).toBe('Set 3 tasks to High priority');
    expect(describeChange('PAY-1', { assignee: null })).toBe('Unassigned PAY-1');
    expect(describeChange('PAY-1', { dueDate: '2026-11-04' }, TODAY)).toBe('Set PAY-1 due Nov 4');
    expect(
      describeChange('PAY-1', {
        addLabels: [
          { id: 'a', name: 'payouts', color: 1, source: 'app' },
          { id: 'b', name: 'api', color: 2, source: 'app' },
        ],
      }),
    ).toBe('Added payouts and api to PAY-1');
    expect(describeChange('PAY-1', { removeBlockers: ['PAY-3'] })).toBe('PAY-1 no longer waits on PAY-3');
    expect(
      describeChange('PAY-5', { parent: { key: 'PAY-1', title: '', status: 'todo', assignee: null } }),
    ).toBe('Made PAY-5 a subtask of PAY-1');
  });
});
