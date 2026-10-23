import type { Cycle, CycleDetail, MilestoneWithProgress, TaskListItem } from '@pm/contracts';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CycleDialog, checkCycleDates, cycleDefaults } from './CycleDialog';
import { cycleSummaryText, parseCycleParam, rolledOverTo } from './CyclePage';
import { cyclesSubtitle, splitCycles } from './CyclesScreen';
import { EndCycleDialog, moveToFor } from './EndCycleDialog';
import { MilestoneDialog } from './MilestoneDialog';
import { milestonesSubtitle, sortMilestones, targetText } from './MilestonesScreen';
import { addedMarker, groupTasks } from './PlanningTaskTable';
import { parseMilestonesSearch, parsePlanningTasksSearch } from './search';

// The dialogs and helpers under test never call the API; the stub keeps the server modules out.
vi.mock('~/lib/orpc', async () => {
  const { createTanstackQueryUtils } = await import('@orpc/tanstack-query');
  const fail = (): unknown =>
    new Proxy(() => {}, {
      get: (_target, key) => (typeof key === 'string' ? fail() : undefined),
      apply: () => Promise.reject(new Error('no API in these tests')),
    });
  const client = fail();
  return { client, orpc: createTanstackQueryUtils(client as never) };
});

const TODAY = '2026-10-23';
const PROJECT = { id: '00000000-0000-7000-8000-000000000001', key: 'PAY', name: 'Payments' };
const ANA = { id: '00000000-0000-7000-8000-0000000000a1', name: 'Ana Ruiz', kind: 'person' as const };

function counts(partial: Partial<Cycle['counts']> = {}): Cycle['counts'] {
  return {
    backlog: 0,
    todo: 0,
    in_progress: 0,
    in_review: 0,
    done: 0,
    canceled: 0,
    total: 0,
    addedAfterStart: 0,
    unassigned: 0,
    agents: 0,
    ...partial,
  };
}

function cycle(number: number, partial: Partial<CycleDetail> = {}): CycleDetail {
  return {
    id: `00000000-0000-7000-8000-${String(number).padStart(12, '0')}`,
    project: PROJECT,
    number,
    name: null,
    startsOn: '2026-10-12',
    endsOn: '2026-10-25',
    state: 'current',
    daysLeft: 3,
    counts: counts(),
    completedAt: null,
    endedBy: null,
    summary: null,
    rollovers: [],
    ...partial,
  };
}

function milestone(name: string, partial: Partial<MilestoneWithProgress> = {}): MilestoneWithProgress {
  return {
    id: `00000000-0000-7000-8000-${name.length.toString().padStart(12, '0')}`,
    project: PROJECT,
    name,
    description: null,
    targetDate: null,
    status: 'planned',
    completedAt: null,
    createdBy: ANA,
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    progress: { total: 0, done: 0, inProgress: 0, open: 0, canceled: 0 },
    daysLeft: null,
    overdue: false,
    ...partial,
  };
}

function task(number: number, partial: Partial<TaskListItem> = {}): TaskListItem {
  return {
    id: `00000000-0000-7000-9000-${String(number).padStart(12, '0')}`,
    key: `PAY-${number}`,
    number,
    project: PROJECT,
    title: `Task ${number}`,
    status: 'todo',
    priority: 'medium',
    assignee: null,
    milestone: null,
    cycle: null,
    cycleAddedAt: null,
    rank: number,
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    ...partial,
  };
}

// ---------------------------------------------------------------------------
// Milestone dialog
// ---------------------------------------------------------------------------

describe('MilestoneDialog', () => {
  function setup(
    onSubmit = vi.fn().mockResolvedValue(null),
    extra: Partial<Parameters<typeof MilestoneDialog>[0]> = {},
  ) {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <MilestoneDialog
        isOpen
        onClose={onClose}
        projectKey="PAY"
        today={TODAY}
        onSubmit={onSubmit}
        {...extra}
      />,
    );
    return { user, onSubmit, onClose };
  }

  it('opens on the name, says how it starts, and refuses an empty name', async () => {
    const { user, onSubmit } = setup();
    expect(screen.getByRole('dialog', { name: 'New milestone' })).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveFocus();
    expect(
      screen.getByText('Starts as Planned. It turns Active when a task in it starts.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Create/ }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Name is required')).toBeInTheDocument();
  });

  it('sends the name, description and a quick-pick target date', async () => {
    const { user, onSubmit } = setup();
    await user.type(screen.getByLabelText('Name'), 'PCI DSS 4.0 self-assessment');
    await user.type(screen.getByLabelText(/Description/), 'Evidence for the yearly questionnaire');
    await user.click(screen.getByRole('button', { name: /Target date/ }));
    await user.click(screen.getByRole('button', { name: 'End of quarter' }));
    expect(screen.getByRole('button', { name: /Target date/ })).toHaveTextContent('Dec 31, 2026');
    await user.click(screen.getByRole('button', { name: /^Create/ }));
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'PCI DSS 4.0 self-assessment',
      description: 'Evidence for the yearly questionnaire',
      targetDate: '2026-12-31',
    });
  });

  it('picks a day from the calendar with the keyboard', async () => {
    const { user, onSubmit } = setup();
    await user.type(screen.getByLabelText('Name'), 'Webhooks v2');
    await user.click(screen.getByRole('button', { name: /Target date/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Oct 23, 2026, today' })).toHaveFocus());
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowLeft}{Enter}');
    const trigger = screen.getByRole('button', { name: /Target date/ });
    expect(trigger).toHaveTextContent('Nov 12, 2026');
    // Picking closes the calendar and hands focus back to the field.
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await user.click(screen.getByLabelText('Name'));
    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Webhooks v2',
      description: null,
      targetDate: '2026-11-12',
    });
  });

  it('shows a taken name on the name field', async () => {
    const onSubmit = vi
      .fn()
      .mockResolvedValue({ field: 'name', message: 'PAY already has a milestone named “X”.' });
    const { user } = setup(onSubmit);
    await user.type(screen.getByLabelText('Name'), 'X');
    await user.click(screen.getByRole('button', { name: /^Create/ }));
    expect(await screen.findByText('PAY already has a milestone named “X”.')).toBeInTheDocument();
  });

  it('edits with the status and asks before deleting', async () => {
    const onSubmit = vi.fn().mockResolvedValue(null);
    const onDelete = vi.fn().mockResolvedValue(null);
    const { user } = setup(onSubmit, {
      milestone: milestone('Webhooks v2', {
        status: 'active',
        targetDate: '2026-11-14',
        progress: { total: 22, done: 14, inProgress: 5, open: 3, canceled: 0 },
      }),
      onDelete,
    });
    expect(screen.getByRole('dialog', { name: 'Edit milestone' })).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('Webhooks v2');
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByText('Its 22 tasks lose the milestone.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Delete milestone' }));
    expect(onDelete).toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Cycles
// ---------------------------------------------------------------------------

describe('cycle defaults', () => {
  it('starts the first cycle next Monday for two weeks', () => {
    expect(cycleDefaults([], TODAY)).toEqual({
      startsOn: '2026-10-26',
      endsOn: '2026-11-08',
      hint: 'Two weeks from Monday, Oct 26. You can change the length.',
    });
  });

  it('follows the last cycle with the same length (frame 28)', () => {
    const cycles = [
      cycle(13, { startsOn: '2026-10-26', endsOn: '2026-11-08', state: 'upcoming' }),
      cycle(14, { startsOn: '2026-11-09', endsOn: '2026-11-22', state: 'upcoming' }),
      cycle(12),
    ];
    expect(cycleDefaults(cycles, TODAY)).toEqual({
      startsOn: '2026-11-23',
      endsOn: '2026-12-06',
      hint: '2 weeks, the same length as Cycle 14. It starts the day after Cycle 14 ends.',
    });
  });

  it('starts today when the last cycle ended a while ago', () => {
    const old = cycle(3, { startsOn: '2026-09-01', endsOn: '2026-09-07', state: 'completed' });
    expect(cycleDefaults([old], TODAY)).toMatchObject({ startsOn: TODAY, endsOn: '2026-10-29' });
  });

  it('checks dates like core', () => {
    expect(checkCycleDates('2026-10-26', '2026-10-25', TODAY)).toBe('End on or after the start date.');
    expect(checkCycleDates('2026-10-26', '2026-12-31', TODAY)).toBe('Keep cycles to 56 days or fewer.');
    expect(checkCycleDates('2026-10-01', '2026-10-20', TODAY)).toBe('A cycle cannot end before today.');
    expect(checkCycleDates('2026-10-26', '2026-11-08', TODAY)).toBeNull();
  });
});

describe('CycleDialog', () => {
  it('prefills the dates, shifts the end with the start, and sends the name', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(null);
    render(
      <CycleDialog
        isOpen
        onClose={() => {}}
        projectKey="PAY"
        number={15}
        defaults={cycleDefaults(
          [cycle(14, { startsOn: '2026-11-09', endsOn: '2026-11-22', state: 'upcoming' })],
          TODAY,
        )}
        today={TODAY}
        onSubmit={onSubmit}
      />,
    );
    expect(screen.getByText('Cycle 15 ·')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Starts/ })).toHaveTextContent('Mon, Nov 23');
    expect(screen.getByRole('button', { name: /Ends/ })).toHaveTextContent('Sun, Dec 6');
    await user.click(screen.getByRole('button', { name: /Starts/ }));
    await user.click(await screen.findByRole('button', { name: 'Nov 30, 2026' }));
    expect(screen.getByRole('button', { name: /Ends/ })).toHaveTextContent('Sun, Dec 13');
    expect(screen.getByText('2 weeks, Nov 30 to Dec 13.')).toBeInTheDocument();
    await user.type(screen.getByRole('textbox'), 'Checkout rewrite');
    await user.click(screen.getByRole('button', { name: /^Create/ }));
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Checkout rewrite',
      startsOn: '2026-11-30',
      endsOn: '2026-12-13',
    });
  });
});

describe('EndCycleDialog', () => {
  const current = cycle(12, {
    counts: counts({ total: 18, done: 9, in_progress: 4, in_review: 1, todo: 4 }),
  });
  const unfinished = [
    task(144, { status: 'todo' }),
    task(142, { status: 'in_progress', assignee: { ...ANA, responsible: null } }),
    task(138, { status: 'in_review' }),
  ];

  it('moves unfinished tasks to the next cycle by default (frame 25)', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(null);
    const next = cycle(13, {
      startsOn: '2026-10-26',
      endsOn: '2026-11-08',
      state: 'upcoming',
      counts: counts({ total: 2 }),
    });
    render(
      <EndCycleDialog
        isOpen
        onClose={() => {}}
        cycle={current}
        next={next}
        newNumber={15}
        unfinished={unfinished}
        onSubmit={onSubmit}
      />,
    );
    const dialog = screen.getByRole('dialog', { name: 'End Cycle 12 now?' });
    expect(dialog).toHaveTextContent('9 of 18 tasks are done. The other 3 move to the next cycle.');
    expect(dialog).toHaveTextContent('It would end on its own on Oct 25 at midnight.');
    expect(screen.getByText('Oct 26 – Nov 8 · 2 tasks')).toBeInTheDocument();
    const rows = within(screen.getByRole('list', { name: 'Unfinished · 3' })).getAllByRole('listitem');
    expect(rows.map((row) => row.textContent?.slice(0, 7))).toEqual(['PAY-142', 'PAY-138', 'PAY-144']);
    await user.click(screen.getByRole('button', { name: 'End and move 3' }));
    expect(onSubmit).toHaveBeenCalledWith(13);
  });

  it('offers a new cycle when none is planned, and No cycle', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(null);
    render(
      <EndCycleDialog
        isOpen
        onClose={() => {}}
        cycle={current}
        newNumber={13}
        unfinished={unfinished}
        onSubmit={onSubmit}
      />,
    );
    expect(screen.getByText('New Cycle 13')).toBeInTheDocument();
    expect(screen.getByText('Oct 26 – Nov 8 · same length')).toBeInTheDocument();
    await user.click(screen.getByText('No cycle'));
    expect(screen.getByRole('dialog')).toHaveTextContent('The other 3 go back to the project list.');
    await user.click(screen.getByRole('button', { name: 'End and move 3' }));
    expect(onSubmit).toHaveBeenCalledWith('none');
  });

  it('maps the choice to moveTo', () => {
    expect(moveToFor('next', { number: 13 })).toBe(13);
    expect(moveToFor('next', undefined)).toBeUndefined();
    expect(moveToFor('none', { number: 13 })).toBe('none');
  });
});

describe('cycle lists and pages', () => {
  it('splits and describes the cycles', () => {
    const items = [
      cycle(11, { state: 'completed', daysLeft: null }),
      cycle(12),
      cycle(14, { state: 'upcoming', startsOn: '2026-11-09', endsOn: '2026-11-22', daysLeft: null }),
      cycle(13, { state: 'upcoming', startsOn: '2026-10-26', endsOn: '2026-11-08', daysLeft: null }),
    ];
    const split = splitCycles(items);
    expect(split.current?.number).toBe(12);
    expect(split.upcoming.map((item) => item.number)).toEqual([13, 14]);
    expect(split.completed.map((item) => item.number)).toEqual([11]);
    expect(cyclesSubtitle(split, TODAY, items.length)).toBe('Cycle 12 ends Sunday');
    expect(cyclesSubtitle({ ...split, current: undefined }, TODAY, items.length)).toBe(
      'Cycle 13 starts Monday',
    );
    expect(cyclesSubtitle(splitCycles([]), TODAY, 0)).toBe('no cycles yet');
  });

  it('reads cycle route params', () => {
    expect(parseCycleParam('12')).toBe(12);
    expect(parseCycleParam('current')).toBe('current');
    expect(parseCycleParam('0')).toBeNull();
    expect(parseCycleParam('12a')).toBeNull();
  });

  it('summarises a completed cycle', () => {
    const done = cycle(11, {
      name: 'Webhook retries',
      startsOn: '2026-09-28',
      endsOn: '2026-10-11',
      state: 'completed',
      daysLeft: null,
      summary: { scope: 20, completed: 16, rolledOver: 1, canceled: 1, addedAfterStart: 2 },
      rollovers: [
        {
          task: { id: task(131).id, key: 'PAY-131', title: 'Add idempotency keys', status: 'in_progress' },
          statusAtEnd: 'in_progress',
          movedTo: { id: cycle(12).id, number: 12, name: null },
          createdAt: '2026-10-12T00:00:00.000Z',
        },
      ],
    });
    expect(rolledOverTo(done.rollovers)).toBe('to Cycle 12');
    expect(rolledOverTo([])).toBe('nothing moved');
    expect(cycleSummaryText(done, [task(118, { title: 'Drop XML webhooks', status: 'canceled' })])).toBe(
      [
        'Cycle 11 · Webhook retries (Sep 28 – Oct 11)',
        'Scope 20 · Completed 16 (80%) · Rolled over 1 · Canceled 1',
        '',
        'Rolled over:',
        '- PAY-131 Add idempotency keys (In progress, to Cycle 12)',
        '',
        'Canceled:',
        '- PAY-118 Drop XML webhooks',
      ].join('\n'),
    );
  });

  it('marks tasks added after the start, only once hydrated', () => {
    const late = task(153, { cycleAddedAt: '2026-10-17T10:00:00.000Z' });
    const early = task(142, { cycleAddedAt: '2026-10-11T10:00:00.000Z' });
    const now = Date.parse('2026-10-23T10:00:00.000Z');
    expect(addedMarker(late, '2026-10-12', now)).toBe('+ Oct 17');
    expect(addedMarker(early, '2026-10-12', now)).toBe('');
    expect(addedMarker(late, '2026-10-12', null)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Milestone list helpers, task groups, search params
// ---------------------------------------------------------------------------

describe('milestone list', () => {
  it('sorts by target date with undated last, by name, or by progress', () => {
    const items = [
      milestone('Refunds rework'),
      milestone('Webhooks v2', {
        targetDate: '2026-11-14',
        progress: { total: 22, done: 14, inProgress: 5, open: 3, canceled: 0 },
      }),
      milestone('PCI audit', {
        targetDate: '2026-10-20',
        progress: { total: 14, done: 10, inProgress: 2, open: 2, canceled: 0 },
      }),
    ];
    expect(sortMilestones(items, 'target').map((item) => item.name)).toEqual([
      'PCI audit',
      'Webhooks v2',
      'Refunds rework',
    ]);
    expect(sortMilestones(items, 'name').map((item) => item.name)).toEqual([
      'PCI audit',
      'Refunds rework',
      'Webhooks v2',
    ]);
    expect(sortMilestones(items, 'progress').map((item) => item.name)).toEqual([
      'PCI audit',
      'Webhooks v2',
      'Refunds rework',
    ]);
  });

  it('describes targets (frame 14)', () => {
    expect(
      targetText(
        milestone('PCI', { targetDate: '2026-10-20', daysLeft: -3, overdue: true, status: 'active' }),
        TODAY,
      ),
    ).toEqual({
      date: 'Oct 20',
      sub: '3 days overdue',
      tone: 'warn',
    });
    expect(targetText(milestone('SEPA', { targetDate: '2027-01-30', daysLeft: 99 }), TODAY)).toEqual({
      date: 'Jan 30, 2027',
      sub: '99 days left',
      tone: 'default',
    });
    expect(targetText(milestone('Refunds'), TODAY)).toEqual({ date: 'No date', sub: '', tone: 'faint' });
    expect(milestonesSubtitle([milestone('A'), milestone('B', { status: 'completed' })])).toBe(
      '1 open milestone',
    );
    expect(milestonesSubtitle([])).toBe('no milestones yet');
  });

  it('groups tasks by status in the list order', () => {
    const groups = groupTasks([
      task(1, { status: 'done' }),
      task(2, { status: 'todo', priority: 'low' }),
      task(3, { status: 'in_progress' }),
      task(4, { status: 'todo', priority: 'urgent' }),
    ]);
    expect(groups.map((group) => [group.id, group.items.map((item) => item.key)])).toEqual([
      ['in_progress', ['PAY-3']],
      ['todo', ['PAY-4', 'PAY-2']],
      ['done', ['PAY-1']],
    ]);
  });

  it('parses search params and drops what it does not know', () => {
    expect(parseMilestonesSearch({ status: 'planned,bogus', sort: 'name' })).toEqual({
      status: ['planned'],
      sort: 'name',
    });
    expect(parseMilestonesSearch({ sort: 'target' })).toEqual({});
    expect(
      parsePlanningTasksSearch({ status: ['todo', 'nope'], assignee: 'me', cycle: 12, milestone: '' }),
    ).toEqual({
      status: ['todo'],
      assignee: 'me',
      cycle: '12',
    });
  });
});
