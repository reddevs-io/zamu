import type { TaskListItem } from '@pm/contracts';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PlanningTaskTable } from './PlanningTaskTable';

// Keyboard moves in the milestone and cycle task tables: no selection, so focus moves alone.

const PROJECT = { id: '00000000-0000-7000-8000-000000000001', key: 'PAY', name: 'Payments' };

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

// Groups: In progress PAY-1; Todo PAY-2, PAY-3; Done PAY-4 (folded).
const TASKS = [
  task(1, { status: 'in_progress' }),
  task(2, { priority: 'high' }),
  task(3),
  task(4, { status: 'done' }),
];

const row = (key: string) => screen.getByRole('row', { name: new RegExp(`${key}\\b`) });
const focused = (key: string) => row(key).contains(document.activeElement);
const group = (name: string) =>
  screen.getAllByRole('row').find((element) => element.textContent?.startsWith(name)) as HTMLElement;

describe('PlanningTaskTable keyboard', () => {
  it('moves with the arrow keys and J/K over group rows, folds with Left and Right, opens with Enter', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(<PlanningTaskTable aria-label="Tasks in Webhooks v2" tasks={TASKS} now={null} onOpen={onOpen} />);

    await user.tab(); // Tab lands on the first row, a group row
    expect(group('In progress')).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(focused('PAY-1')).toBe(true);
    await user.keyboard('{ArrowDown}'); // over the Todo group row
    expect(focused('PAY-2')).toBe(true);
    await user.keyboard('jj'); // PAY-3, then stays: Done is folded
    expect(focused('PAY-3')).toBe(true);
    await user.keyboard('kk');
    expect(focused('PAY-1')).toBe(true);
    expect(row('PAY-1')).not.toHaveAttribute('aria-selected');

    await user.keyboard('{ArrowLeft}');
    expect(group('In progress')).toHaveFocus();
    expect(group('In progress')).toHaveTextContent(/collapsed/);
    await user.keyboard('{ArrowDown}');
    expect(focused('PAY-2')).toBe(true);
    await user.keyboard('{ArrowUp}'); // nothing above: the folded group is skipped
    expect(focused('PAY-2')).toBe(true);

    await user.keyboard('{Enter}');
    expect(onOpen).toHaveBeenCalledWith('PAY-2');
  });

  it('unfolds Done with Right onto its first task', async () => {
    const user = userEvent.setup();
    render(<PlanningTaskTable aria-label="Tasks" tasks={TASKS} now={null} onOpen={() => {}} />);
    await user.click(screen.getByText('Done')); // unfold
    await user.click(screen.getByText('Done')); // fold again; focus stays on the group row
    expect(screen.queryByRole('row', { name: /PAY-4\b/ })).not.toBeInTheDocument();
    await user.keyboard('{ArrowRight}');
    expect(focused('PAY-4')).toBe(true);
  });
});
