import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { describe, expect, it, vi } from 'vitest';
import { Avatar, agentMark, UnassignedAvatar } from './Avatar';
import { Calendar } from './Calendar';
import { ColorSwatches } from './ColorSwatches';
import { cn } from './cn';
import { ConfirmDialog } from './Dialog';
import { DueChip, dueText } from './DueChip';
import { LabelChip, LabelList } from './LabelChip';
import { BlockedMarker, SubtaskProgress } from './Markers';
import { PickerMenu, type PickerMenuItem, PickerMenuPopover, type PickerMenuProps } from './PickerMenu';
import { PriorityGlyph, showsPriorityOnCards } from './PriorityGlyph';
import { StatusGlyph } from './StatusGlyph';

const STATUSES: PickerMenuItem[] = [
  { id: 'backlog', label: 'Backlog', numberKey: '1' },
  { id: 'todo', label: 'Todo', numberKey: '2' },
  { id: 'in_progress', label: 'In progress', numberKey: '3' },
  { id: 'in_review', label: 'In review', numberKey: '4' },
  { id: 'done', label: 'Done', numberKey: '5' },
  { id: 'canceled', label: 'Canceled', numberKey: '6', tone: 'dim' },
];

const LABELS: PickerMenuItem[] = [
  { id: 'payouts', label: 'payouts', meta: '34' },
  { id: 'reliability', label: 'reliability', meta: '12' },
  { id: 'refunds', label: 'refunds', meta: '7' },
];

function StatusMenu(props: Partial<PickerMenuProps>) {
  return (
    <PickerMenu
      aria-label="Status"
      items={STATUSES}
      selectedKeys={['todo']}
      search={{ placeholder: 'Change status…', kbd: 'S' }}
      {...props}
    />
  );
}

function LabelMenu({
  onCreate,
  onClose,
  onChange,
}: {
  onCreate?: (query: string) => void;
  onClose?: () => void;
  onChange?: (ids: Set<string>) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(['payouts']));
  return (
    <PickerMenu
      aria-label="Labels"
      selectionMode="multiple"
      sections={[
        { id: 'on', title: 'On this task', items: LABELS.slice(0, 1) },
        { id: 'all', title: 'All labels in Payments · 3', items: LABELS.slice(1) },
      ]}
      selectedKeys={selected}
      onSelectionChange={(next) => {
        setSelected(next);
        onChange?.(next);
      }}
      onClose={onClose}
      search={{ placeholder: 'Add labels…', kbd: 'L' }}
      create={{
        label: (q) => `Create label “${q}”`,
        emptyTitle: (q) => `No label named “${q}” in Payments`,
        onCreate: onCreate ?? (() => {}),
      }}
      footer={{ hints: [{ keys: '↵', label: 'toggle' }], end: `${selected.size} selected` }}
    />
  );
}

function PopoverExample({ onAction }: { onAction: (id: string) => void }) {
  return (
    <PickerMenuPopover
      aria-label="Status"
      trigger={<AriaButton>Status</AriaButton>}
      items={STATUSES}
      selectedKeys={['todo']}
      onAction={onAction}
      numberKeys
      search={{ placeholder: 'Change status…', kbd: 'S' }}
    />
  );
}

function CalendarExample({ onChange }: { onChange: (value: string) => void }) {
  const [value, setValue] = useState<string | null>('2026-11-14');
  return (
    <Calendar
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

const items = (menu: HTMLElement) => [...menu.querySelectorAll<HTMLElement>('[role^="menuitem"]')];

describe('PickerMenu', () => {
  it('opens with the search focused and a check on the current value', () => {
    render(<StatusMenu />);
    expect(screen.getByRole('searchbox', { name: 'Change status' })).toHaveFocus();
    const menu = screen.getByRole('menu', { name: 'Status' });
    expect(items(menu)).toHaveLength(6);
    expect(within(menu).getByRole('menuitemradio', { name: /Todo/ })).toHaveAttribute('aria-checked', 'true');
  });

  it('filters as you type, moves with the arrows and picks with Enter', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const onClose = vi.fn();
    render(<StatusMenu onAction={onAction} onClose={onClose} />);
    await user.keyboard('in');
    const menu = screen.getByRole('menu', { name: 'Status' });
    expect(items(menu).map((item) => item.textContent)).toEqual(['In progress', 'In review']);
    // Typing highlights the first match; ↓ moves to the next one.
    expect(items(menu)[0]).toHaveAttribute('data-focused', 'true');
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onAction).toHaveBeenCalledWith('in_review');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('highlights the typed text in each match', async () => {
    const user = userEvent.setup();
    render(<StatusMenu />);
    await user.keyboard('rev');
    const mark = screen.getByRole('menu').querySelector('mark');
    expect(mark).toHaveTextContent('rev');
  });

  it('picks with number keys while the search is empty, and filters with them otherwise', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(
      <StatusMenu
        numberKeys
        onAction={onAction}
        items={[...STATUSES, { id: 'v2', label: 'Release 2', numberKey: undefined }]}
      />,
    );
    await user.keyboard('3');
    expect(onAction).toHaveBeenLastCalledWith('in_progress');
    expect(screen.getByRole('searchbox')).toHaveValue('');
    await user.keyboard('r');
    await user.keyboard('2');
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('searchbox')).toHaveValue('r2');
  });

  it('ignores number keys unless numberKeys is on', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(<StatusMenu onAction={onAction} />);
    await user.keyboard('3');
    expect(onAction).not.toHaveBeenCalled();
    expect(screen.getByRole('searchbox')).toHaveValue('3');
  });

  it('toggles with Enter in multi-select menus and stays open', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onClose = vi.fn();
    render(<LabelMenu onChange={onChange} onClose={onClose} />);
    const menu = screen.getByRole('menu', { name: 'Labels' });
    expect(within(menu).getByText('On this task')).toBeInTheDocument();
    expect(screen.getByText('1 selected')).toBeInTheDocument();
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect([...(onChange.mock.lastCall?.[0] ?? [])].sort()).toEqual(['payouts', 'reliability']);
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    expect(within(menu).getByRole('menuitemcheckbox', { name: /reliability/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await user.keyboard('{Enter}');
    expect([...(onChange.mock.lastCall?.[0] ?? [])]).toEqual(['payouts']);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('offers to create a label for text that matches nothing', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(<LabelMenu onCreate={onCreate} />);
    await user.keyboard('billing');
    expect(screen.getByText('No label named “billing” in Payments')).toBeInTheDocument();
    const create = screen.getByRole('menuitemcheckbox', { name: /Create label “billing”/ });
    expect(create).toBeInTheDocument();
    await user.keyboard('{Enter}');
    expect(onCreate).toHaveBeenCalledWith('billing');
  });

  it('does not offer to create a name that exists', async () => {
    const user = userEvent.setup();
    render(<LabelMenu />);
    await user.keyboard('Refunds');
    expect(screen.queryByText(/Create label/)).not.toBeInTheDocument();
  });

  it('creates with ⌘Enter when the create trigger is mod-enter', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    const onAction = vi.fn();
    render(
      <PickerMenu
        aria-label="Subtask"
        selectionMode="none"
        items={[{ id: 'PAY-152', taskKey: 'PAY-152', label: 'Alert copy for the on-call channel' }]}
        onAction={onAction}
        create={{ label: (q) => `Create subtask “${q}”`, trigger: 'mod-enter', onCreate }}
        search={{ placeholder: 'Add a subtask…' }}
      />,
    );
    await user.keyboard('alert');
    await user.keyboard('{Meta>}{Enter}{/Meta}');
    expect(onCreate).toHaveBeenCalledWith('alert');
    expect(onAction).not.toHaveBeenCalled();
  });

  it('keeps a refused item reachable, reads its note and does nothing on Enter', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(
      <PickerMenu
        aria-label="Blocked by"
        selectionMode="none"
        onAction={onAction}
        items={[
          {
            id: 'PAY-150',
            taskKey: 'PAY-150',
            label: 'Payout status webhooks',
            tone: 'dim',
            refusal: 'Can’t add: PAY-150 already waits on PAY-142.',
          },
        ]}
        search={{ placeholder: 'Search tasks…' }}
      />,
    );
    await user.keyboard('150{ArrowDown}');
    const item = screen.getByRole('menuitem', { name: /PAY-150/ });
    expect(item).toHaveAccessibleDescription('Can’t add: PAY-150 already waits on PAY-142.');
    await user.keyboard('{Enter}');
    expect(onAction).not.toHaveBeenCalled();
  });

  it('removes the highlighted removable item with Backspace on an empty search', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(
      <PickerMenu
        aria-label="Blocked by"
        selectionMode="none"
        onRemove={onRemove}
        sections={[
          {
            id: 'current',
            title: 'Blocked by',
            filter: false,
            items: [
              { id: 'PAY-120', taskKey: 'PAY-120', label: 'Idempotency keys', removable: true },
              { id: 'PAY-131', taskKey: 'PAY-131', label: 'Payout state machine', removable: true },
            ],
          },
        ]}
        search={{ placeholder: 'Search tasks…' }}
      />,
    );
    await user.keyboard('{ArrowDown}{ArrowDown}{Backspace}');
    expect(onRemove).toHaveBeenCalledWith('PAY-131');
    // Unfiltered sections stay while you search.
    await user.keyboard('zzz');
    expect(screen.getByRole('menuitem', { name: /PAY-120/ })).toBeInTheDocument();
  });

  it('clears the search on Escape, then asks to close', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<StatusMenu onClose={onClose} />);
    await user.keyboard('to{Escape}');
    expect(screen.getByRole('searchbox')).toHaveValue('');
    expect(onClose).not.toHaveBeenCalled();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows the empty text when nothing matches', async () => {
    const user = userEvent.setup();
    render(<StatusMenu emptyText="No status matches" />);
    await user.keyboard('zzz');
    expect(screen.getByText('No status matches')).toBeInTheDocument();
  });
});

describe('PickerMenuPopover', () => {
  it('opens on press, picks with a number key, closes and returns focus', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(<PopoverExample onAction={onAction} />);
    const trigger = screen.getByRole('button', { name: 'Status' });
    await user.click(trigger);
    expect(screen.getByRole('searchbox')).toHaveFocus();
    await user.keyboard('5');
    expect(onAction).toHaveBeenCalledWith('done');
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('closes on the second Escape', async () => {
    const user = userEvent.setup();
    render(<PopoverExample onAction={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Status' }));
    await user.keyboard('do{Escape}');
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  });
});

describe('DueChip', () => {
  const today = '2026-11-03';
  const chip = (dueDate: string | null, status: Parameters<typeof DueChip>[0]['status'] = 'todo') => {
    const { container, unmount } = render(<DueChip dueDate={dueDate} status={status} today={today} />);
    const node = container.querySelector('[data-due]');
    const result = { state: node?.getAttribute('data-due') ?? null, text: node?.textContent ?? '' };
    unmount();
    return result;
  };

  it('reads future, soon, today, overdue and done dates', () => {
    expect(chip('2026-11-14')).toEqual({ state: 'future', text: 'Nov 14' });
    expect(chip('2026-11-04')).toEqual({ state: 'soon', text: 'Tomorrow' });
    expect(chip('2026-11-05')).toEqual({ state: 'soon', text: 'In 2 days' });
    expect(chip('2026-11-03')).toEqual({ state: 'today', text: 'Today' });
    expect(chip('2026-10-31')).toEqual({ state: 'overdue', text: '3 days overdue' });
    expect(chip('2026-11-02')).toEqual({ state: 'overdue', text: '1 day overdue' });
    expect(chip('2026-10-02', 'done')).toEqual({ state: 'done', text: 'Oct 2 · done' });
    expect(chip('2026-10-02', 'canceled')).toEqual({ state: 'done', text: 'Oct 2 · done' });
    expect(chip('2027-01-08')).toEqual({ state: 'future', text: 'Jan 8, 2027' });
  });

  it('renders nothing without a date unless a placeholder is given', () => {
    expect(chip(null).state).toBeNull();
    render(<DueChip dueDate={null} status="todo" today={today} placeholder="Set due date" />);
    expect(screen.getByText('Set due date')).toHaveAttribute('data-due', 'none');
  });

  it('adds the date after relative words in the task view', () => {
    render(<DueChip dueDate="2026-10-31" status="in_progress" today={today} withDate />);
    expect(screen.getByText('3 days overdue').parentElement).toHaveTextContent('3 days overdueOct 31');
    expect(dueText('2026-11-14', 'future', today)).toBe('Nov 14');
  });

  it('draws overdue in danger and done quietly', () => {
    render(
      <>
        <DueChip dueDate="2026-10-31" status="todo" today={today} />
        <DueChip dueDate="2026-10-02" status="done" today={today} />
      </>,
    );
    expect(screen.getByText('3 days overdue')).toHaveClass('text-danger');
    expect(screen.getByText('Oct 2 · done')).toHaveClass('text-fg-3');
  });
});

describe('PriorityGlyph', () => {
  it('shows only Urgent and High on cards and rows', () => {
    expect(['urgent', 'high', 'medium', 'low', 'none'].map((p) => showsPriorityOnCards(p as never))).toEqual([
      true,
      true,
      false,
      false,
      false,
    ]);
    expect(showsPriorityOnCards(4)).toBe(true);
    expect(showsPriorityOnCards(2)).toBe(false);
    const { container } = render(
      <>
        <PriorityGlyph priority="urgent" context="compact" />
        <PriorityGlyph priority="high" context="compact" />
        <PriorityGlyph priority="medium" context="compact" />
        <PriorityGlyph priority="low" context="compact" />
        <PriorityGlyph priority="none" context="compact" keepSpace={false} />
      </>,
    );
    expect(screen.getAllByRole('img').map((node) => node.getAttribute('aria-label'))).toEqual([
      'Priority: Urgent',
      'Priority: High',
    ]);
    // Medium and Low keep an empty slot so columns line up; None asked for no slot.
    expect(container.querySelectorAll('[data-priority="medium"], [data-priority="low"]')).toHaveLength(2);
    expect(container.querySelector('[data-priority="none"]')).toBeNull();
  });

  it('shows every priority in menus and the task view', () => {
    render(
      <>
        <PriorityGlyph priority="medium" />
        <PriorityGlyph priority="none" withLabel />
      </>,
    );
    expect(screen.getByRole('img', { name: 'Priority: Medium' })).toBeInTheDocument();
    expect(screen.getByText('None')).toBeInTheDocument();
  });
});

describe('StatusGlyph', () => {
  it('names each of the six statuses', () => {
    render(
      <div>
        {(['backlog', 'todo', 'in_progress', 'in_review', 'done', 'canceled'] as const).map((status) => (
          <StatusGlyph key={status} status={status} />
        ))}
      </div>,
    );
    expect(screen.getAllByRole('img').map((node) => node.getAttribute('aria-label'))).toEqual([
      'Backlog',
      'Todo',
      'In progress',
      'In review',
      'Done',
      'Canceled',
    ]);
  });
});

describe('Avatar', () => {
  it('draws people round with initials, agents square with a two-letter mark, unassigned dashed', () => {
    render(
      <>
        <Avatar name="Ana Ruiz" />
        <Avatar name="claude-dev" kind="agent" size={22} />
        <Avatar name="review-bot" kind="agent" size={28} hue={250} />
        <UnassignedAvatar />
      </>,
    );
    const ana = screen.getByRole('img', { name: 'Ana Ruiz' });
    expect(ana).toHaveAttribute('data-kind', 'person');
    expect(ana).toHaveTextContent('AR');
    expect(ana).toHaveClass('rounded-full');
    expect(ana).toHaveStyle({ width: '18px', height: '18px' });

    const agent = screen.getByRole('img', { name: 'claude-dev' });
    expect(agent).toHaveAttribute('data-kind', 'agent');
    expect(agent).toHaveTextContent('cd');
    expect(agent).not.toHaveClass('rounded-full');
    expect(agent).toHaveStyle({ width: '22px' });
    expect(screen.getByRole('img', { name: 'review-bot' })).toHaveStyle({ width: '28px' });

    const none = screen.getByRole('img', { name: 'Unassigned' });
    expect(none).toHaveAttribute('data-kind', 'none');
    expect(none).toHaveClass('border-dashed');
  });

  it('keeps the older size names and hides decorative avatars', () => {
    const { container } = render(<Avatar name="Tomás Ferrer" size="md" decorative />);
    const node = container.firstElementChild as HTMLElement;
    expect(node).toHaveAttribute('aria-hidden', 'true');
    expect(node).toHaveStyle({ width: '28px' });
    expect(agentMark('codex')).toBe('co');
    expect(agentMark('review-bot')).toBe('rb');
  });
});

describe('Chips and markers', () => {
  it('label chips show the dot, a lock when mirrored, and +N past the limit', () => {
    render(
      <>
        <LabelChip name="needs-owner" color={7} locked />
        <LabelList
          max={2}
          labels={[
            { name: 'backend', color: 2 },
            { name: 'security', color: 4 },
            { name: 'perf', color: 9 },
          ]}
        />
      </>,
    );
    expect(screen.getByText('needs-owner').parentElement).toHaveTextContent('(from Backlog.md)');
    expect(screen.getByText('+1')).toBeInTheDocument();
    expect(screen.getByText('and perf')).toBeInTheDocument();
  });

  it('subtask progress and the blocked marker carry their meaning in text', () => {
    render(
      <>
        <SubtaskProgress done={2} total={7} />
        <SubtaskProgress done={3} total={4} format="long" />
        <BlockedMarker count={2} />
        <BlockedMarker count={0} />
      </>,
    );
    expect(screen.getByRole('img', { name: '2 of 7 subtasks done' })).toHaveTextContent('2/7');
    expect(screen.getByRole('img', { name: '3 of 4 subtasks done' })).toHaveTextContent('3 of 4 done');
    expect(screen.getAllByText(/^Blocked/)).toHaveLength(1);
    expect(screen.getByText('Blocked')).toHaveTextContent('Blocked by 2 open tasks');
  });
});

describe('Calendar', () => {
  it('shows the selected day, picks a day by click and by keyboard', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<CalendarExample onChange={onChange} />);
    expect(screen.getByRole('heading', { name: /November 2026/ })).toBeInTheDocument();
    const grid = screen.getByRole('grid');
    expect(within(grid).getByRole('gridcell', { selected: true })).toHaveTextContent('14');
    // Monday first.
    expect(grid.querySelector('th')).toHaveTextContent('Mo');
    await user.click(within(grid).getByRole('button', { name: /November 20, 2026/ }));
    expect(onChange).toHaveBeenLastCalledWith('2026-11-20');
    await user.keyboard('{ArrowRight}{ArrowDown}{Enter}');
    expect(onChange).toHaveBeenLastCalledWith('2026-11-28');
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('follows the value from outside without calling onChange', () => {
    const onChange = vi.fn();
    const { rerender } = render(<Calendar value="2026-11-14" onChange={onChange} />);
    // Mounting with a value doesn't announce it as a new selection.
    expect(document.body).not.toHaveTextContent(/Selected Date: Saturday, November 14/);
    rerender(<Calendar value="2026-12-01" onChange={onChange} />);
    expect(screen.getByRole('heading', { name: /December 2026/ })).toBeInTheDocument();
    expect(screen.getByRole('gridcell', { selected: true })).toHaveTextContent('1');
    rerender(<Calendar value={null} onChange={onChange} />);
    expect(screen.queryByRole('gridcell', { selected: true })).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('ColorSwatches', () => {
  it('is a radio group of nine named hues moved with the arrow keys', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ColorSwatches label="Colour" value={1} onChange={onChange} />);
    const group = screen.getByRole('radiogroup', { name: 'Colour' });
    expect(within(group).getAllByRole('radio')).toHaveLength(9);
    expect(within(group).getByRole('radio', { name: 'Blue' })).toBeChecked();
    await user.tab();
    await user.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenLastCalledWith(2);
  });
});

describe('ConfirmDialog', () => {
  it('keeps the button pending while the action runs, then closes', async () => {
    const user = userEvent.setup();
    let resolve: () => void = () => {};
    const onOpenChange = vi.fn();
    render(
      <ConfirmDialog
        isOpen
        onOpenChange={onOpenChange}
        title="Delete the label “reliability”?"
        confirmLabel="Delete label"
        onConfirm={() =>
          new Promise<void>((done) => {
            resolve = done;
          })
        }
      >
        It’s used on <b>12 tasks</b> in Payments.
      </ConfirmDialog>,
    );
    const dialog = screen.getByRole('alertdialog', { name: 'Delete the label “reliability”?' });
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.click(within(dialog).getByRole('button', { name: 'Delete label' }));
    expect(within(dialog).getByRole('button', { name: 'Delete label' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    resolve();
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('shows the error and stays open when the action fails', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <ConfirmDialog
        isOpen
        onOpenChange={onOpenChange}
        title="Delete project?"
        confirmLabel="Delete project"
        onConfirm={() => Promise.reject(new Error('The project has a running import.'))}
      >
        Everything in it goes.
      </ConfirmDialog>,
    );
    await user.click(screen.getByRole('button', { name: 'Delete project' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The project has a running import.');
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});

describe('cn', () => {
  it('merges the Margin type, radius and shadow scales', () => {
    expect(cn('text-sm', 'text-xs')).toBe('text-xs');
    expect(cn('text-md text-fg-2', 'text-lg')).toBe('text-fg-2 text-lg');
    expect(cn('rounded-sm', 'rounded-pill')).toBe('rounded-pill');
    expect(cn('shadow-card', 'shadow-pop')).toBe('shadow-pop');
    expect(cn('leading-ui', 'leading-prose')).toBe('leading-prose');
    expect(cn('text-fg', 'text-danger')).toBe('text-danger');
  });
});
