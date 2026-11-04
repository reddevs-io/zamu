import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { describe, expect, it, vi } from 'vitest';
import { BoardColumn, SwimlaneHeader } from './Board';
import {
  filterPickerItems,
  movePickerActive,
  type PickerItem,
  PickerList,
  PickerPopover,
  pickerOptionId,
} from './PickerPopover';
import { CycleGlyph } from './PlanningGlyph';
import { ProgressBar } from './Progress';
import { SegmentedControl } from './SegmentedControl';
import { StatStrip, StatTile } from './Stat';
import { Toast } from './Toast';

const ITEMS: PickerItem[] = [
  { id: 'pci', label: 'PCI audit', meta: 'Oct 20', metaTone: 'warn' },
  { id: 'webhooks', label: 'Webhooks v2', meta: 'Nov 14' },
  { id: 'sepa', label: 'SEPA Direct Debit', meta: 'Jan 30', isDisabled: true },
];

function SegmentedExample({ onChange }: { onChange?: (value: string) => void }) {
  const [value, setValue] = useState<'list' | 'board'>('list');
  return (
    <SegmentedControl
      aria-label="View"
      items={[
        { id: 'list', label: 'List' },
        { id: 'board', label: 'Board' },
      ]}
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
    />
  );
}

function FoldExample() {
  const [folded, setFolded] = useState(true);
  return (
    <BoardColumn status="done" count={64} isFolded={folded} onFoldChange={setFolded}>
      <span>card</span>
    </BoardColumn>
  );
}

function PickerExample({ onChange }: { onChange: (value: string | null) => void }) {
  return (
    <PickerPopover
      aria-label="Milestone"
      items={ITEMS}
      value="webhooks"
      onChange={onChange}
      none={{ label: 'No milestone' }}
      searchPlaceholder="Set milestone…"
      kbd="⇧M"
    >
      <AriaButton>Milestone</AriaButton>
    </PickerPopover>
  );
}

describe('SegmentedControl', () => {
  it('picks a segment by click and keeps one selected', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SegmentedExample onChange={onChange} />);
    const board = screen.getByRole('radio', { name: 'Board' });
    await user.click(board);
    expect(onChange).toHaveBeenCalledWith('board');
    expect(board).toBeChecked();
    // Clicking the selected segment again does not clear the selection.
    await user.click(board);
    expect(board).toBeChecked();
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('moves with arrow keys and selects with Space', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SegmentedExample onChange={onChange} />);
    await user.tab();
    expect(screen.getByRole('radio', { name: 'List' })).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Board' })).toHaveFocus();
    await user.keyboard(' ');
    expect(onChange).toHaveBeenCalledWith('board');
  });
});

describe('progress and glyphs', () => {
  it('ProgressBar reports done of total and sizes both parts', () => {
    render(<ProgressBar done={14} inProgress={5} total={22} showCount />);
    const bar = screen.getByRole('progressbar', { name: 'Progress' });
    expect(bar).toHaveAttribute('aria-valuenow', '14');
    expect(bar).toHaveAttribute('aria-valuemax', '22');
    expect(bar).toHaveAttribute('aria-valuetext', '14 of 22 done, 5 in progress');
    expect(bar.querySelector('[data-part="done"]')).toHaveStyle({ width: `${(14 / 22) * 100}%` });
    expect(bar.querySelector('[data-part="in-progress"]')).toHaveStyle({ width: `${(5 / 22) * 100}%` });
    expect(screen.getByText('14/22')).toBeInTheDocument();
  });

  it('ProgressBar handles an empty total', () => {
    render(<ProgressBar done={0} total={0} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuetext', '0 of 0 done');
  });

  it('CycleGlyph draws a pie for progress and is decorative without a label', () => {
    const { container, rerender } = render(<CycleGlyph state="progress" progress={0.79} />);
    const glyph = container.firstElementChild as HTMLElement;
    expect(glyph).toHaveAttribute('aria-hidden', 'true');
    expect(glyph.style.getPropertyValue('--p')).toBe('79%');
    expect(glyph).toHaveAttribute('data-glyph', 'cycle-progress');
    rerender(<CycleGlyph state="done" label="Completed cycle" />);
    expect(screen.getByRole('img', { name: 'Completed cycle' })).toBeInTheDocument();
  });

  it('StatStrip lays out one column per tile', () => {
    render(
      <StatStrip aria-label="Cycle 11">
        <StatTile label="Scope" value={20} sub="2 added after start" />
        <StatTile label="Completed" value={16} tone="done" />
      </StatStrip>,
    );
    const strip = screen.getByLabelText('Cycle 11');
    expect(strip.style.gridTemplateColumns).toBe('repeat(2, minmax(0, 1fr))');
    expect(within(strip).getByText('Scope')).toBeInTheDocument();
  });
});

describe('Board', () => {
  it('folds and expands a column', async () => {
    const user = userEvent.setup();
    render(<FoldExample />);
    expect(screen.queryByText('card')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Expand Done, 64 tasks' }));
    expect(screen.getByText('card')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Fold Done, 64 tasks' }));
    expect(screen.queryByText('card')).not.toBeInTheDocument();
  });

  it('marks the drop target and shows the "more" footer', () => {
    const onAdd = vi.fn();
    render(
      <BoardColumn status="todo" count={60} isDropTarget onAdd={onAdd} more="49 more · scroll or press J" />,
    );
    expect(screen.getByRole('region', { name: 'Todo, 60 tasks' })).toHaveAttribute(
      'data-drop-target',
      'true',
    );
    expect(screen.getByText('49 more · scroll or press J')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New task in Todo' })).toBeInTheDocument();
  });

  it('SwimlaneHeader toggles', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<SwimlaneHeader title="No assignee" count={4} isOpen onOpenChange={onOpenChange} />);
    const button = screen.getByRole('button', { name: /No assignee/ });
    expect(button).toHaveAttribute('aria-expanded', 'true');
    await user.click(button);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe('PickerPopover', () => {
  it('opens with the search focused, the none item first and a check on the current value', async () => {
    const user = userEvent.setup();
    render(<PickerExample onChange={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Milestone' }));
    expect(screen.getByRole('searchbox')).toHaveFocus();
    const menu = screen.getByRole('menu', { name: 'Milestone' });
    const options = within(menu).getAllByRole('menuitemradio');
    expect(options.map((option) => option.textContent)).toEqual([
      'No milestone',
      'PCI audit' + 'Oct 20',
      'Webhooks v2' + 'Nov 14✓',
      'SEPA Direct Debit' + 'Jan 30',
    ]);
    expect(within(menu).getByRole('menuitemradio', { name: /Webhooks v2/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('filters as you type and picks with Enter', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<PickerExample onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Milestone' }));
    await user.keyboard('pci');
    const menu = screen.getByRole('menu', { name: 'Milestone' });
    expect(within(menu).getAllByRole('menuitemradio')).toHaveLength(1);
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith('pci');
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  });

  it('clears the search on Escape, then closes on the next Escape', async () => {
    const user = userEvent.setup();
    render(<PickerExample onChange={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Milestone' }));
    await user.keyboard('pc');
    await user.keyboard('{Escape}');
    expect(screen.getByRole('searchbox')).toHaveValue('');
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  });

  it('returns null for the none item', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<PickerExample onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Milestone' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'No milestone' }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('shows the empty text when nothing matches', async () => {
    const user = userEvent.setup();
    render(<PickerExample onChange={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Milestone' }));
    await user.keyboard('zzz');
    expect(screen.getByText('No matches')).toBeInTheDocument();
  });
});

describe('PickerList helpers', () => {
  it('moves the active item with wrap-around and skips disabled items', () => {
    expect(movePickerActive(ITEMS, null, 1)).toBe('pci');
    expect(movePickerActive(ITEMS, null, -1)).toBe('webhooks');
    expect(movePickerActive(ITEMS, 'pci', 1)).toBe('webhooks');
    expect(movePickerActive(ITEMS, 'webhooks', 1)).toBe('pci');
    expect(movePickerActive([], null, 1)).toBeNull();
  });

  it('filters case- and accent-insensitively', () => {
    const people: PickerItem[] = [
      { id: 'tomas', label: 'Tomás Berg' },
      { id: 'claude', label: 'claude-dev' },
    ];
    expect(filterPickerItems(people, 'toma').map((item) => item.id)).toEqual(['tomas']);
    expect(filterPickerItems(people, 'CL').map((item) => item.id)).toEqual(['claude']);
    expect(filterPickerItems(people, '')).toHaveLength(2);
  });

  it('PickerList exposes the active option for aria-activedescendant and selects on click', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <PickerList
        id="mentions"
        aria-label="Mention"
        title="Mention · cl"
        items={ITEMS}
        activeId="webhooks"
        onSelect={onSelect}
      />,
    );
    const active = screen.getByRole('option', { name: /Webhooks v2/ });
    expect(active).toHaveAttribute('id', pickerOptionId('mentions', 'webhooks'));
    expect(active).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByRole('option', { name: /PCI audit/ }));
    expect(onSelect).toHaveBeenCalledWith('pci');
    await user.click(screen.getByRole('option', { name: /SEPA/ }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});

describe('Toast', () => {
  it('runs its action and dismisses after the timeout', async () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    const onAction = vi.fn();
    render(
      <Toast action={{ label: 'Undo', onAction }} kbd="⌘Z" timeout={5000} onDismiss={onDismiss}>
        PAY-140 moved to In review
      </Toast>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('PAY-140 moved to In review');
    vi.advanceTimersByTime(4999);
    expect(onDismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});
