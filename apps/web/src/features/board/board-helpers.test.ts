import type { TaskListItem, TaskListPage, TaskStatus } from '@pm/contracts';
import { describe, expect, it } from 'vitest';
import { cycleElapsed, cycleNote, projectTabs, projectViewHref } from '~/features/project-header/tabs';
import {
  applyProjectFeatures,
  boardInput,
  boardStatuses,
  filtersOf,
  hasFilters,
  parseTaskListSearch,
} from '~/features/tasks/search';
import { cardsOf, insertCard, rankFor, removeCard, shiftCounts } from './board-cache';
import { describeFilters, emptyBoardText } from './describe';
import { buildLanes, NO_LANE } from './lanes';
import { focusTarget, type NavColumn, placementBetween, reorderPlacement, statusStep } from './layout';
import type { BoardColumnData } from './queries';

const card = (key: string, rank: number, extra: Partial<TaskListItem> = {}): TaskListItem => ({
  id: `00000000-0000-4000-8000-${key.replace(/\D/g, '').padStart(12, '0')}`,
  key,
  number: Number(key.replace(/\D/g, '')),
  project: { id: '10000000-0000-4000-8000-000000000001', key: 'PAY', name: 'Payments' },
  title: key,
  status: 'todo',
  priority: 'none',
  assignee: null,
  milestone: null,
  cycle: null,
  cycleAddedAt: null,
  rank,
  createdAt: '2026-10-20T10:00:00.000Z',
  updatedAt: '2026-10-20T10:00:00.000Z',
  ...extra,
});

const counts = { backlog: 0, todo: 3, in_progress: 1, in_review: 0, done: 0, canceled: 0 };
const page = (items: TaskListItem[], nextCursor: string | null = null): TaskListPage => ({
  items,
  nextCursor,
  counts,
});
const column = (...pages: TaskListPage[]): BoardColumnData => ({ pages, pageParams: pages.map(() => null) });
const keys = (data: BoardColumnData) => cardsOf(data).map((item) => item.key);

describe('board cache', () => {
  const data = column(page([card('PAY-1', 1), card('PAY-2', 2)]), page([card('PAY-3', 3)]));

  it('inserts at the top, next to an anchor, or by rank', () => {
    const moving = card('PAY-9', 0);
    expect(keys(insertCard(data, moving, 'top'))).toEqual(['PAY-9', 'PAY-1', 'PAY-2', 'PAY-3']);
    expect(keys(insertCard(data, moving, { before: 'PAY-3' }))).toEqual(['PAY-1', 'PAY-2', 'PAY-9', 'PAY-3']);
    expect(keys(insertCard(data, moving, { after: 'PAY-1' }))).toEqual(['PAY-1', 'PAY-9', 'PAY-2', 'PAY-3']);
    expect(keys(insertCard(data, card('PAY-9', 2.5), 'rank'))).toEqual(['PAY-1', 'PAY-2', 'PAY-9', 'PAY-3']);
    // An unknown anchor falls back to the rank.
    expect(keys(insertCard(data, card('PAY-9', 1.5), { after: 'PAY-404' }))).toEqual([
      'PAY-1',
      'PAY-9',
      'PAY-2',
      'PAY-3',
    ]);
  });

  it('leaves a card that sorts past the loaded pages for the next page', () => {
    const partial = column(page([card('PAY-1', 1)], 'next'));
    expect(keys(insertCard(partial, card('PAY-9', 5), 'rank'))).toEqual(['PAY-1']);
  });

  it('moves a card within its column without duplicating it', () => {
    expect(keys(insertCard(data, card('PAY-3', 3), 'top'))).toEqual(['PAY-3', 'PAY-1', 'PAY-2']);
    expect(keys(removeCard(data, 'PAY-2'))).toEqual(['PAY-1', 'PAY-3']);
  });

  it('shifts the counts of every page', () => {
    const shifted = shiftCounts(data, 'todo', 'in_progress');
    expect(shifted.pages.map((item) => [item.counts.todo, item.counts.in_progress])).toEqual([
      [2, 2],
      [2, 2],
    ]);
    expect(shiftCounts(data, 'todo', 'todo')).toBe(data);
  });

  it('ranks between neighbours', () => {
    const cards = [card('PAY-1', 1), card('PAY-2', 2)];
    expect(rankFor(cards, 'top', 9)).toBe(0);
    expect(rankFor(cards, { before: 'PAY-2' }, 9)).toBe(1.5);
    expect(rankFor(cards, { after: 'PAY-2' }, 9)).toBe(3);
    expect(rankFor(cards, { before: 'PAY-1' }, 9)).toBe(0);
    expect(rankFor(cards, 'rank', 9)).toBe(9);
  });
});

describe('board keyboard geometry', () => {
  const nav: NavColumn[] = [
    { status: 'backlog', cells: [{ lane: null, keys: ['A1'] }] },
    { status: 'todo', cells: [{ lane: null, keys: [] }] },
    { status: 'in_progress', cells: [{ lane: null, keys: ['C1', 'C2', 'C3'] }] },
  ];

  it('starts on the first card and stops at the ends', () => {
    expect(focusTarget(nav, null, 'down')).toEqual({ key: 'A1' });
    expect(focusTarget(nav, 'C1', 'up')).toEqual({ key: 'C1' });
    expect(focusTarget(nav, 'C3', 'down')).toEqual({ end: 'in_progress' });
    expect(focusTarget(nav, 'C2', 'down')).toEqual({ key: 'C3' });
  });

  it('skips empty columns and keeps the row between columns', () => {
    expect(focusTarget(nav, 'A1', 'right')).toEqual({ key: 'C1' });
    expect(focusTarget(nav, 'C3', 'left')).toEqual({ key: 'A1' });
    expect(focusTarget(nav, 'A1', 'left')).toEqual({ key: 'A1' });
  });

  it('keeps the lane between columns on a swimlane board', () => {
    const lanes: NavColumn[] = [
      {
        status: 'todo',
        cells: [
          { lane: 'ana', keys: ['T1'] },
          { lane: 'tomas', keys: ['T2', 'T3'] },
        ],
      },
      {
        status: 'in_progress',
        cells: [
          { lane: 'ana', keys: ['P1', 'P2'] },
          { lane: 'tomas', keys: ['P3'] },
        ],
      },
    ];
    expect(focusTarget(lanes, 'T3', 'right')).toEqual({ key: 'P3' });
    expect(focusTarget(lanes, 'P2', 'left')).toEqual({ key: 'T1' });
    expect(focusTarget(lanes, 'T1', 'down')).toEqual({ key: 'T2' });
    // Reordering stays inside the lane.
    expect(reorderPlacement(lanes, 'T1', 'down')).toBeNull();
    expect(reorderPlacement(lanes, 'T2', 'down')).toEqual({ after: 'T3' });
    expect(reorderPlacement(lanes, 'T3', 'up')).toEqual({ before: 'T2' });
  });

  it('steps statuses and puts cards back between their neighbours', () => {
    const statuses: TaskStatus[] = ['backlog', 'todo', 'in_progress'];
    expect(statusStep(statuses, 'todo', 'right')).toBe('in_progress');
    expect(statusStep(statuses, 'backlog', 'left')).toBeNull();
    expect(placementBetween('A', 'B')).toEqual({ after: 'A' });
    expect(placementBetween(null, 'B')).toEqual({ before: 'B' });
    expect(placementBetween(null, null)).toBe('top');
  });
});

describe('swimlanes', () => {
  const ana = { id: '00000000-0000-4000-8000-0000000000a1', name: 'Ana Ruiz', kind: 'person' as const };
  const bot = { id: '00000000-0000-4000-8000-0000000000b1', name: 'claude-dev', kind: 'agent' as const };
  it('puts agents first, then people, then the unassigned', () => {
    const lanes = buildLanes('assignee', [
      {
        status: 'todo',
        cards: [
          card('PAY-1', 1, { assignee: { ...ana, responsible: null } }),
          card('PAY-2', 2),
          card('PAY-3', 3, { assignee: { ...bot, responsible: ana } }),
        ],
      },
      {
        status: 'in_progress',
        cards: [card('PAY-4', 1, { status: 'in_progress', assignee: { ...ana, responsible: null } })],
      },
    ]);
    expect(lanes.map((lane) => [lane.title, lane.count])).toEqual([
      ['claude-dev', 1],
      ['Ana Ruiz', 2],
      ['No assignee', 1],
    ]);
    expect(lanes[1]?.cells.in_progress?.map((item) => item.key)).toEqual(['PAY-4']);
    expect(lanes[2]?.id).toBe(NO_LANE);
  });

  it('orders milestone lanes like the milestone list', () => {
    const m1 = {
      id: '00000000-0000-4000-8000-0000000000c1',
      name: 'Zeta',
      status: 'planned' as const,
      targetDate: null,
    };
    const m2 = {
      id: '00000000-0000-4000-8000-0000000000c2',
      name: 'Alpha',
      status: 'active' as const,
      targetDate: null,
    };
    const lanes = buildLanes(
      'milestone',
      [
        {
          status: 'todo',
          cards: [card('PAY-1', 1, { milestone: m2 }), card('PAY-2', 2, { milestone: m1 }), card('PAY-3', 3)],
        },
      ],
      [m1.id, m2.id],
    );
    expect(lanes.map((lane) => lane.title)).toEqual(['Zeta', 'Alpha', 'No milestone']);
  });
});

describe('board search params', () => {
  it('parses view, lanes, milestone and cycle', () => {
    expect(
      parseTaskListSearch({
        view: 'board',
        lanes: 'milestone',
        milestone: 'NONE',
        cycle: '12',
      }),
    ).toEqual({ view: 'board', lanes: 'milestone', cycle: 12 });
    expect(parseTaskListSearch({ cycle: 'current', milestone: 'none' })).toEqual({
      cycle: 'current',
      milestone: 'none',
    });
    expect(parseTaskListSearch({ view: 'grid', lanes: 'status', cycle: '0', milestone: 'x' })).toEqual({});
  });

  it('keeps view and lanes out of the query filters', () => {
    const search = parseTaskListSearch({ view: 'board', lanes: 'assignee', task: 'PAY-1', cycle: 3 });
    expect(filtersOf(search)).toEqual({ cycle: 3 });
    expect(hasFilters({ view: 'board', lanes: 'assignee' })).toBe(false);
    expect(hasFilters({ milestone: 'none' })).toBe(true);
    expect(boardInput('PAY', { cycle: 3, q: ' x ' }, 'todo')).toEqual({
      project: ['PAY'],
      order: 'board',
      status: ['todo'],
      q: 'x',
      cycle: 3,
    });
  });

  it('drops filters of features the project turned off and orders board columns', () => {
    expect(
      applyProjectFeatures(
        { milestone: 'none', cycle: 'next', q: 'a' },
        { usesMilestones: false, usesCycles: true },
      ),
    ).toEqual({ q: 'a', cycle: 'next' });
    expect(boardStatuses({})).toEqual(['backlog', 'todo', 'in_progress', 'in_review', 'done', 'canceled']);
    expect(boardStatuses({ status: ['done', 'todo'] })).toEqual(['todo', 'done']);
  });
});

describe('filter words', () => {
  it('describes the filters for the subtitle and the empty board', () => {
    const names = { members: new Map([['u1', 'Tomás Berg']]) };
    expect(describeFilters({ cycle: 12, assignee: 'agents' }, names)).toEqual([
      'Cycle 12',
      'assigned to agents',
    ]);
    expect(describeFilters({ assignee: 'u1', priority: ['low', 'urgent'] }, names)).toEqual([
      'assigned to Tomás Berg',
      'priority Urgent or Low',
    ]);
    expect(emptyBoardText({ cycle: 12, assignee: 'agents' })).toBe(
      'Cycle 12 has no tasks assigned to agents. Clear the filters, or add tasks to the cycle from the list.',
    );
    expect(emptyBoardText({ q: 'refund' })).toBe(
      'Nothing matches: matching "refund". Clear the filters, or create a task.',
    );
  });
});

describe('project header tabs', () => {
  const project = {
    key: 'PAY',
    openCount: 12,
    usesMilestones: true,
    usesCycles: true,
    currentCycle: {
      id: 'c',
      number: 12,
      name: null,
      startsOn: '2026-10-12',
      endsOn: '2026-10-25',
      daysLeft: 3,
    },
  };

  it('shows Tasks, Milestones, Cycles with their notes, then Settings', () => {
    const tabs = projectTabs(project, 3);
    expect(tabs.map((tab) => [tab.id, tab.href, tab.count ?? tab.note])).toEqual([
      ['tasks', '/p/PAY', 12],
      ['milestones', '/p/PAY/milestones', 3],
      ['cycles', '/p/PAY/cycles', 'C12 · 3d left'],
      ['settings', '/p/PAY/settings', undefined],
    ]);
    expect(cycleNote(null)).toBeUndefined();
    expect(cycleElapsed(project.currentCycle)).toBeCloseTo(11 / 14);
    expect(projectViewHref('PAY', 'cycles')).toBe('/p/PAY/cycles');
  });

  it('leaves out turned-off features; Tasks and Settings always stay', () => {
    expect(projectTabs({ ...project, usesCycles: false }).map((tab) => tab.id)).toEqual([
      'tasks',
      'milestones',
      'settings',
    ]);
    expect(
      projectTabs({ ...project, usesMilestones: false, usesCycles: false }).map((tab) => tab.id),
    ).toEqual(['tasks', 'settings']);
    expect(projectViewHref('PAY', 'settings')).toBe('/p/PAY/settings');
  });
});
