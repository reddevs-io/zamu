import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type DataColumn, type DataGroup, DataTable } from './DataTable';
import { useHotkeys } from './useHotkeys';

interface Item {
  key: string;
  title: string;
}

const columns: DataColumn<Item>[] = [
  { id: 'key', header: 'Key', width: 72, isRowHeader: true, cell: (item) => <span>{item.key}</span> },
  { id: 'title', header: 'Title', width: '1fr', cell: (item) => <span>{item.title}</span> },
];

const groups: DataGroup<Item>[] = [
  {
    id: 'in_progress',
    label: 'In progress',
    status: 'in_progress',
    items: [
      { key: 'PAY-1', title: 'Payouts' },
      { key: 'PAY-2', title: 'Refunds' },
    ],
  },
  { id: 'todo', label: 'Todo', status: 'todo', items: [{ key: 'PAY-3', title: 'Coupons' }] },
];

function Harness({
  onSelect,
  onAction,
  onHotkey,
  initial = 'PAY-1',
}: {
  onSelect?: (key: string | null) => void;
  onAction?: (key: string) => void;
  onHotkey?: () => void;
  initial?: string | null;
}) {
  const [selected, setSelected] = useState<string | null>(initial);
  useHotkeys({ c: () => onHotkey?.() });
  return (
    <DataTable
      aria-label="Tasks"
      columns={columns}
      groups={groups}
      getKey={(item) => item.key}
      selectedKey={selected}
      onSelectionChange={(key) => {
        setSelected(key);
        onSelect?.(key);
      }}
      onRowAction={onAction}
    />
  );
}

const row = (name: RegExp) => screen.getByRole('row', { name });

/** Puts keyboard focus on the row of the given task key. */
async function focusRow(user: ReturnType<typeof userEvent.setup>, key: string) {
  await user.tab();
  // Tab lands on the selected row (or the first row); walk to the wanted one.
  const target = row(new RegExp(key));
  for (let i = 0; i < 6 && !target.contains(document.activeElement); i++) await user.keyboard('{ArrowDown}');
  expect(target.contains(document.activeElement)).toBe(true);
}

describe('DataTable keyboard', () => {
  it('moves the selection with arrow keys and J/K, skipping nothing', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);

    await user.tab();
    expect(row(/PAY-1/).contains(document.activeElement)).toBe(true);

    await user.keyboard('{ArrowDown}');
    expect(onSelect).toHaveBeenLastCalledWith('PAY-2');
    expect(row(/PAY-2/)).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('j'); // onto the Todo group row: focus moves, selection stays
    expect(document.activeElement?.textContent).toMatch(/Todo/);
    expect(row(/PAY-2/)).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('j');
    expect(onSelect).toHaveBeenLastCalledWith('PAY-3');

    await user.keyboard('k');
    await user.keyboard('k');
    expect(onSelect).toHaveBeenLastCalledWith('PAY-2');
  });

  it('runs the row action on Enter', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(<Harness onAction={onAction} />);
    await focusRow(user, 'PAY-2');
    await user.keyboard('{Enter}');
    expect(onAction).toHaveBeenCalledWith('PAY-2', { key: 'PAY-2', title: 'Refunds' });
  });

  it('collapses and expands a group with Enter', async () => {
    const user = userEvent.setup();
    render(<Harness initial={null} />);
    await user.tab();
    const group = screen.getByRole('row', { name: /In progress/ });
    expect(group.contains(document.activeElement)).toBe(true);
    expect(within(group).getByText(/expanded/)).toBeInTheDocument();

    await user.keyboard('{Enter}');
    expect(screen.queryByRole('row', { name: /PAY-1/ })).not.toBeInTheDocument();
    expect(screen.getByRole('row', { name: /In progress/ })).toHaveTextContent(/collapsed/);

    await user.keyboard('{Enter}');
    expect(screen.getByRole('row', { name: /PAY-1/ })).toBeInTheDocument();
  });

  it('does not swallow page shortcuts with type-ahead', async () => {
    const user = userEvent.setup();
    const onHotkey = vi.fn();
    render(<Harness onHotkey={onHotkey} />);
    await user.tab();
    await user.keyboard('c');
    expect(onHotkey).toHaveBeenCalledTimes(1);
  });

  it('leaves Esc to the page instead of clearing the selection', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    await user.tab();
    await user.keyboard('{Escape}');
    expect(onSelect).not.toHaveBeenCalled();
    expect(row(/PAY-1/)).toHaveAttribute('aria-selected', 'true');
  });
});

const many: Item[] = Array.from({ length: 300 }, (_, i) => ({ key: `WEB-${i}`, title: `Task ${i}` }));

function Many({ onSelect }: { onSelect: (key: string) => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <DataTable
      aria-label="Many"
      columns={columns}
      items={many}
      getKey={(item) => item.key}
      selectedKey={selected}
      onSelectionChange={(key) => {
        setSelected(key);
        onSelect(key);
      }}
    />
  );
}

describe('DataTable virtualization', () => {
  // jsdom has no layout; give the scroll view a size so the virtualizer renders a window of rows.
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => 600);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => 400);
  });
  afterEach(() => vi.restoreAllMocks());

  it('renders only the visible rows of a 300-row table and still navigates', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Many onSelect={onSelect} />);
    await act(async () => {});

    const grid = screen.getByRole('grid', { name: 'Many' });
    expect(grid).toHaveAttribute('aria-rowcount', '301');
    const rendered = within(grid).getAllByRole('row').length;
    expect(rendered).toBeGreaterThan(5);
    expect(rendered).toBeLessThan(60);

    await user.tab();
    await user.keyboard('{ArrowDown}');
    await user.keyboard('j');
    expect(onSelect).toHaveBeenLastCalledWith('WEB-2');
  });
});
