import type { TaskListItem } from '@pm/contracts';
import { describe, expect, it } from 'vitest';
import { buildMyGroups, myTasksSubtitle } from './groups';
import { hasFilters, listInput, parseMyTasksSearch, shownStatuses } from './search';

const MILESTONE = '01a16819-7636-72b1-86d0-aaf9ad8fff37';

function item(key: string, overrides: Partial<TaskListItem> = {}): TaskListItem {
  const [projectKey = 'PAY', number = '1'] = key.split('-');
  return {
    id: `id-${key}`,
    key,
    number: Number(number),
    project: { id: `p-${projectKey}`, key: projectKey, name: projectKey === 'PAY' ? 'Payments' : 'Website' },
    title: `Task ${key}`,
    status: 'todo',
    priority: 'none',
    assignee: null,
    milestone: null,
    cycle: null,
    cycleAddedAt: null,
    rank: 1,
    createdAt: '2026-10-20T10:00:00.000Z',
    updatedAt: '2026-10-20T10:00:00.000Z',
    ...overrides,
  };
}

describe('parseMyTasksSearch', () => {
  it('keeps valid params and normalises them', () => {
    expect(
      parseMyTasksSearch({
        task: 'web-88',
        q: ' pricing ',
        project: 'pay,web,PAY,not a key',
        status: 'todo,in_progress,bogus',
        priority: ['high', 'nope'],
        milestone: MILESTONE.toUpperCase(),
        cycle: 'current',
      }),
    ).toEqual({
      task: 'WEB-88',
      q: ' pricing ',
      project: ['PAY', 'WEB'],
      status: ['in_progress', 'todo'],
      priority: ['high'],
      milestone: MILESTONE,
      cycle: 'current',
    });
  });

  it('drops what it does not understand', () => {
    expect(
      parseMyTasksSearch({ task: 'nope', q: '  ', milestone: 'webhooks', cycle: '12', status: 'x' }),
    ).toEqual({});
    expect(parseMyTasksSearch({ milestone: 'none', cycle: 'none' })).toEqual({
      milestone: 'none',
      cycle: 'none',
    });
  });
});

describe('listInput', () => {
  it('asks for the open tasks assigned to me in every project by default', () => {
    expect(listInput({})).toEqual({
      assignee: 'me',
      order: 'list',
      status: ['in_progress', 'in_review', 'todo', 'backlog'],
    });
    expect(hasFilters({ task: 'PAY-1' })).toBe(false);
  });

  it('passes every filter through', () => {
    const filters = parseMyTasksSearch({
      project: 'PAY',
      status: 'done',
      priority: 'urgent',
      milestone: 'none',
      cycle: 'next',
      q: 'refund',
    });
    expect(listInput(filters)).toEqual({
      assignee: 'me',
      order: 'list',
      status: ['done'],
      project: ['PAY'],
      q: 'refund',
      priority: ['urgent'],
      milestone: 'none',
      cycle: 'next',
    });
    expect(hasFilters(filters)).toBe(true);
    expect(shownStatuses(filters)).toEqual(['done']);
  });
});

describe('buildMyGroups', () => {
  it('groups by status in display order and sorts by priority, then most recent', () => {
    const groups = buildMyGroups(
      [
        item('PAY-1', { priority: 'low' }),
        item('WEB-2', { priority: 'urgent' }),
        item('PAY-3', { status: 'in_progress', priority: 'medium' }),
        item('WEB-4', { priority: 'low', updatedAt: '2026-10-21T10:00:00.000Z' }),
        item('PAY-5', { status: 'backlog' }),
      ],
      ['in_progress', 'in_review', 'todo', 'backlog'],
    );
    expect(groups.map((group) => [group.id, group.count])).toEqual([
      ['in_progress', 1],
      ['todo', 3],
      ['backlog', 1],
    ]);
    expect(groups[1]?.items.map((task) => task.key)).toEqual(['WEB-2', 'WEB-4', 'PAY-1']);
  });
});

describe('myTasksSubtitle', () => {
  const counts = { backlog: 1, todo: 5, in_progress: 2, in_review: 0, done: 9, canceled: 1 };
  const items = [item('PAY-1'), item('WEB-2'), item('WEB-3')];

  it('says how many open tasks across how many projects', () => {
    expect(myTasksSubtitle({ counts, items, openOnly: true, workspace: 'Reddevs' })).toBe(
      '8 open across 2 projects in Reddevs',
    );
    expect(myTasksSubtitle({ counts, items, openOnly: true, workspace: 'Reddevs', compact: true })).toBe(
      '8 open across 2 projects',
    );
  });

  it('leaves the project count out when the rows are not the open tasks', () => {
    expect(myTasksSubtitle({ counts, items, openOnly: false, workspace: 'Reddevs' })).toBe(
      '8 open in Reddevs',
    );
  });

  it('shows only the workspace when nothing is open or nothing loaded', () => {
    const none = { backlog: 0, todo: 0, in_progress: 0, in_review: 0, done: 3, canceled: 0 };
    expect(myTasksSubtitle({ counts: none, items: [], openOnly: true, workspace: 'Reddevs' })).toBe(
      'Reddevs',
    );
    expect(myTasksSubtitle({ counts: undefined, items: [], openOnly: true, workspace: 'Reddevs' })).toBe(
      'Reddevs',
    );
    expect(myTasksSubtitle({ counts, items: [item('PAY-1')], openOnly: true, workspace: undefined })).toBe(
      '8 open across 1 project',
    );
  });
});
