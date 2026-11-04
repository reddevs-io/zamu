import { describe, expect, it } from 'vitest';
import { homeFilterOf, homeInput, homeTabOf, parseHomeSearch } from './search';

describe('Home search', () => {
  it('keeps the tab and the filters it knows', () => {
    expect(
      parseHomeSearch({
        tab: 'everyone',
        project: 'pay,WEB,!!',
        label: 'backend,Mobile',
        priority: 'high,bogus',
      }),
    ).toEqual({
      tab: 'everyone',
      project: 'PAY,WEB',
      label: 'backend,Mobile',
      priority: 'high',
    });
    expect(parseHomeSearch({ tab: 'mine', status: 'todo', task: 'PAY-1' })).toEqual({});
  });

  it("reads the M4 dashboard's ?scope=everyone as the Everyone tab", () => {
    expect(parseHomeSearch({ scope: 'everyone' })).toEqual({ tab: 'everyone' });
    expect(homeTabOf({})).toBe('mine');
  });

  it('builds the home.get input', () => {
    expect(homeInput('mine', {})).toEqual({ tab: 'mine' });
    expect(
      homeInput('agents', homeFilterOf({ project: 'PAY', label: 'ui', priority: 'urgent,high' })),
    ).toEqual({
      tab: 'agents',
      project: ['PAY'],
      label: ['ui'],
      priority: ['high', 'urgent'],
    });
  });
});
