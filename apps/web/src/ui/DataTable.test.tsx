import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type RefObject, useMemo, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type DataColumn, type DataGroup, DataTable, type DataTableHandle } from './DataTable';
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

/** In progress PAY-1, PAY-2; Todo PAY-3 (collapsed); Done PAY-4. */
const threeGroups: DataGroup<Item>[] = [
  ...groups,
  { id: 'done', label: 'Done', status: 'done', items: [{ key: 'PAY-4', title: 'Invoices' }] },
];

function Harness({
  onSelect,
  onAction,
  onHotkey,
  initial = 'PAY-1',
  data = groups,
  defaultCollapsed,
  selectable = true,
  tableRef,
}: {
  onSelect?: (key: string | null) => void;
  onAction?: (key: string) => void;
  onHotkey?: () => void;
  initial?: string | null;
  data?: DataGroup<Item>[];
  defaultCollapsed?: string[];
  selectable?: boolean;
  tableRef?: RefObject<DataTableHandle | null>;
}) {
  const [selected, setSelected] = useState<string | null>(initial);
  useHotkeys({ c: () => onHotkey?.() });
  return (
    <DataTable
      ref={tableRef}
      aria-label="Tasks"
      columns={columns}
      groups={data}
      getKey={(item) => item.key}
      selectedKey={selectable ? selected : undefined}
      onSelectionChange={
        selectable
          ? (key) => {
              setSelected(key);
              onSelect?.(key);
            }
          : undefined
      }
      onRowAction={onAction}
      defaultCollapsedGroups={defaultCollapsed}
    />
  );
}

const row = (name: RegExp) => screen.getByRole('row', { name });
const hasFocus = (name: RegExp) => row(name).contains(document.activeElement);

/** Puts keyboard focus on the row of the given task key. */
async function focusRow(user: ReturnType<typeof userEvent.setup>, key: string) {
  await user.tab();
  // Tab lands on the selected row (or the first row); walk to the wanted one.
  const target = row(new RegExp(key));
  for (let i = 0; i < 6 && !target.contains(document.activeElement); i++) await user.keyboard('{ArrowDown}');
  expect(target.contains(document.activeElement)).toBe(true);
}

/** A group whose rows load 30 ms after it unfolds, like the task list's Backlog group. */
function Lazy() {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(['backlog']));
  const [loaded, setLoaded] = useState<Item[]>([]);
  const data = useMemo<DataGroup<Item>[]>(
    () => [
      { id: 'backlog', label: 'Backlog', count: 1, items: loaded },
      { id: 'todo', label: 'Todo', items: [{ key: 'PAY-3', title: 'Coupons' }] },
    ],
    [loaded],
  );
  return (
    <>
      <DataTable
        aria-label="Lazy"
        columns={columns}
        groups={data}
        getKey={(item) => item.key}
        collapsedGroups={collapsed}
        onCollapsedGroupsChange={(next) => {
          setCollapsed(next);
          if (!next.has('backlog')) setTimeout(() => setLoaded([{ key: 'PAY-9', title: 'Late' }]), 30);
        }}
      />
      <button type="button">Outside</button>
    </>
  );
}

describe('DataTable keyboard', () => {
  it('moves the selection with arrow keys and J/K, skipping group rows', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);

    await user.tab();
    expect(hasFocus(/PAY-1/)).toBe(true);

    await user.keyboard('{ArrowDown}');
    expect(onSelect).toHaveBeenLastCalledWith('PAY-2');
    expect(row(/PAY-2/)).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{ArrowDown}'); // over the Todo group row, straight to its task
    expect(onSelect).toHaveBeenLastCalledWith('PAY-3');
    expect(hasFocus(/PAY-3/)).toBe(true);

    await user.keyboard('k'); // back over the group row
    expect(onSelect).toHaveBeenLastCalledWith('PAY-2');
    expect(hasFocus(/PAY-2/)).toBe(true);
    await user.keyboard('j');
    expect(onSelect).toHaveBeenLastCalledWith('PAY-3');

    await user.keyboard('{ArrowUp}{ArrowUp}{ArrowUp}'); // PAY-2, PAY-1, then stays: never the first group row
    expect(onSelect).toHaveBeenLastCalledWith('PAY-1');
    expect(hasFocus(/PAY-1/)).toBe(true);
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}'); // stays on the last row
    expect(hasFocus(/PAY-3/)).toBe(true);
    expect(onSelect).toHaveBeenCalledTimes(8);
  });

  it('skips collapsed groups and moves focus alone without selection', async () => {
    const user = userEvent.setup();
    render(<Harness data={threeGroups} defaultCollapsed={['todo']} selectable={false} initial={null} />);
    await user.tab();
    expect(document.activeElement?.textContent).toMatch(/In progress/); // Tab may land on a group row
    await user.keyboard('{ArrowDown}');
    expect(hasFocus(/PAY-1/)).toBe(true);
    await user.keyboard('jj'); // PAY-2, then over Todo (collapsed) and Done to PAY-4
    expect(hasFocus(/PAY-4/)).toBe(true);
    expect(row(/PAY-4/)).not.toHaveAttribute('aria-selected');
    await user.keyboard('{ArrowUp}');
    expect(hasFocus(/PAY-2/)).toBe(true);
  });

  it('collapses with Left onto the group row and expands with Right onto its first row', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} initial="PAY-2" />);
    await user.tab();
    expect(hasFocus(/PAY-2/)).toBe(true);

    await user.keyboard('{ArrowLeft}');
    const group = row(/In progress/);
    expect(group).toHaveTextContent(/collapsed/);
    expect(group).toHaveFocus();
    expect(screen.queryByRole('row', { name: /PAY-1/ })).not.toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled(); // PAY-2 stays selected while hidden

    await user.keyboard('{ArrowLeft}'); // already collapsed: nothing
    expect(row(/In progress/)).toHaveTextContent(/collapsed/);
    expect(row(/In progress/)).toHaveFocus();

    await user.keyboard('{ArrowRight}');
    expect(row(/In progress/)).toHaveTextContent(/expanded/);
    expect(hasFocus(/PAY-1/)).toBe(true);
    expect(onSelect).toHaveBeenLastCalledWith('PAY-1');

    await user.keyboard('{ArrowRight}'); // on a task row: nothing, focus stays on the row
    expect(row(/PAY-1/)).toHaveFocus();
  });

  it('moves from a group row to the tasks around it', async () => {
    const user = userEvent.setup();
    render(<Harness data={threeGroups} initial="PAY-3" />);
    await user.tab();
    await user.keyboard('{ArrowLeft}'); // focus on the collapsed Todo group row
    expect(row(/Todo/)).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(hasFocus(/PAY-4/)).toBe(true);
    await user.keyboard('{ArrowUp}'); // over the collapsed Todo group
    expect(hasFocus(/PAY-2/)).toBe(true);
    await user.keyboard('{ArrowLeft}{ArrowLeft}'); // collapse In progress; then nothing
    await user.keyboard('{ArrowUp}'); // nothing above the first group row
    expect(row(/In progress/)).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(hasFocus(/PAY-4/)).toBe(true);
  });

  it('toggles a group on click and keeps focus on it', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(within(row(/In progress/)).getByText('In progress'));
    expect(row(/In progress/)).toHaveTextContent(/collapsed/);
    expect(hasFocus(/In progress/)).toBe(true); // React Aria focuses the clicked cell
    await user.click(within(row(/In progress/)).getByText('In progress'));
    expect(row(/In progress/)).toHaveTextContent(/expanded/);
    expect(row(/PAY-1/)).toBeInTheDocument();
    await user.keyboard('{ArrowDown}'); // from the group row's cell to its first task
    expect(hasFocus(/PAY-1/)).toBe(true);
  });

  it('moves and focuses from outside the table through its handle', async () => {
    const user = userEvent.setup();
    const tableRef: RefObject<DataTableHandle | null> = { current: null };
    const onSelect = vi.fn();
    render(
      <>
        <button type="button">Outside</button>
        <Harness
          tableRef={tableRef}
          onSelect={onSelect}
          initial={null}
          data={threeGroups}
          defaultCollapsed={['todo']}
        />
      </>,
    );
    await user.click(screen.getByRole('button', { name: 'Outside' }));
    act(() => tableRef.current?.move(-1)); // nothing selected: K goes to the last task
    expect(onSelect).toHaveBeenLastCalledWith('PAY-4');
    expect(hasFocus(/PAY-4/)).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Outside' }));
    act(() => tableRef.current?.move(-1)); // from the selected task, over the collapsed group
    expect(onSelect).toHaveBeenLastCalledWith('PAY-2');
    expect(hasFocus(/PAY-2/)).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Outside' }));
    act(() => tableRef.current?.focus());
    expect(hasFocus(/PAY-2/)).toBe(true);
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it('focuses the first row of a group whose rows load after Right, unless focus left the table', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Lazy />);
    await user.tab();
    expect(row(/Backlog/)).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(await screen.findByRole('row', { name: /PAY-9/ })).toBeInTheDocument();
    await vi.waitFor(() => expect(hasFocus(/PAY-9/)).toBe(true));
    unmount();

    render(<Lazy />);
    await user.tab();
    await user.keyboard('{ArrowRight}');
    await user.tab(); // to the button before the rows arrive
    expect(await screen.findByRole('row', { name: /PAY-9/ })).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.getByRole('button', { name: 'Outside' })).toHaveFocus();
  });

  it('runs the row action on Enter', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(<Harness onAction={onAction} />);
    await focusRow(user, 'PAY-2');
    await user.keyboard('{Enter}');
    expect(onAction).toHaveBeenCalledWith('PAY-2', { key: 'PAY-2', title: 'Refunds' });
  });

  it('collapses a group with Enter, and expands it onto its first row', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(<Harness initial={null} onAction={onAction} />);
    await user.tab();
    const group = screen.getByRole('row', { name: /In progress/ });
    expect(group.contains(document.activeElement)).toBe(true);
    expect(within(group).getByText(/expanded/)).toBeInTheDocument();

    await user.keyboard('{Enter}');
    expect(screen.queryByRole('row', { name: /PAY-1/ })).not.toBeInTheDocument();
    expect(screen.getByRole('row', { name: /In progress/ })).toHaveTextContent(/collapsed/);
    expect(screen.getByRole('row', { name: /In progress/ })).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(screen.getByRole('row', { name: /PAY-1/ })).toBeInTheDocument();
    expect(hasFocus(/PAY-1/)).toBe(true);
    expect(onAction).not.toHaveBeenCalled();
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

// A column whose cell counts its renders, per row.
const rendered: string[] = [];
const counting: DataColumn<Item>[] = [
  columns[0] as DataColumn<Item>,
  {
    id: 'title',
    header: 'Title',
    width: '1fr',
    cell: (item) => {
      rendered.push(item.key);
      return <span>{item.title}</span>;
    },
  },
];
const tasks: Item[] = Array.from({ length: 20 }, (_, i) => ({ key: `T-${i}`, title: `Task ${i}` }));

/** `rebuild` makes new group arrays on every render, as a page does when its URL changes. */
function Counting({ rebuild = false }: { rebuild?: boolean }) {
  const [selected, setSelected] = useState<string | null>('T-0');
  const [, setTick] = useState(0);
  const stable = useMemo(() => [{ id: 'todo', label: 'Todo', items: tasks }], []);
  const data = rebuild ? [{ id: 'todo', label: 'Todo', items: [...tasks] }] : stable;
  return (
    <>
      <DataTable
        aria-label="Counting"
        columns={counting}
        groups={data}
        getKey={(item) => item.key}
        selectedKey={selected}
        onSelectionChange={(key) => setSelected(key)}
        renderEmptyState={() => <p>None</p>}
      />
      <button type="button" onClick={() => setTick((tick) => tick + 1)}>
        Re-render
      </button>
    </>
  );
}

function Changing() {
  const [list, setList] = useState(tasks);
  return (
    <>
      <button
        type="button"
        onClick={() =>
          setList((items) => items.map((item, i) => (i === 3 ? { ...item, title: 'Renamed' } : item)))
        }
      >
        Rename
      </button>
      <DataTable aria-label="Changing" columns={counting} items={list} getKey={(item) => item.key} />
    </>
  );
}

describe('DataTable rendering', () => {
  it.each([
    ['stable groups', false],
    ['groups rebuilt on every render', true],
  ])('re-renders only the rows whose selection changed (%s)', async (_name, rebuild) => {
    const user = userEvent.setup();
    render(<Counting rebuild={rebuild} />);
    expect(new Set(rendered).size).toBe(20);

    await user.tab();
    rendered.length = 0;
    await user.keyboard('j');
    expect(row(/T-1\b/)).toHaveAttribute('aria-selected', 'true');
    await user.click(within(row(/T-5\b/)).getByText('Task 5'));
    expect(row(/T-5\b/)).toHaveAttribute('aria-selected', 'true');
    // Two selection changes: at most T-0, T-1 and T-5 may render again, every other row must not.
    expect(rendered.filter((key) => !['T-0', 'T-1', 'T-5'].includes(key))).toEqual([]);

    // A parent re-render that changes nothing for the table renders no row.
    rendered.length = 0;
    await user.click(screen.getByRole('button', { name: 'Re-render' }));
    expect(rendered).toEqual([]);
  });

  it('re-renders a row whose item changed, and only that row', async () => {
    rendered.length = 0;
    const user = userEvent.setup();
    render(<Changing />);
    rendered.length = 0;
    await user.click(screen.getByRole('button', { name: 'Rename' }));
    expect(within(row(/T-3\b/)).getByText('Renamed')).toBeInTheDocument();
    expect(rendered).toEqual(['T-3']);
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
