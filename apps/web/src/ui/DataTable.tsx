import {
  type ContextType,
  type CSSProperties,
  type KeyboardEvent,
  memo,
  type ReactNode,
  type Ref,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Cell,
  Column,
  type Key,
  Row,
  type Selection,
  Table,
  TableBody,
  TableHeader,
  TableLayout,
  TableStateContext,
  Virtualizer,
} from 'react-aria-components';
import { cn } from './cn';
import type { TaskStatus } from './meta';
import { Skeleton } from './Skeleton';
import { StatusSquare } from './StatusSquare';

export interface DataColumn<T> {
  id: string;
  /** Header text, drawn as a 10px caps caption. */
  header: string;
  /**
   * Content width in px, or a fraction such as `'1fr'` for the column that takes the rest. Cell padding
   * (24px at the table edges, 12px between columns) is added for you, so pass the widths from the design.
   */
  width: number | `${number}fr`;
  align?: 'start' | 'end';
  /** The column that names the row for screen readers (usually the key or the title). */
  isRowHeader?: boolean;
  cell: (item: T) => ReactNode;
  /** Width of the loading skeleton bar: px or a CSS length. Defaults to 60% of the column. */
  skeleton?: number | string;
}

export interface DataGroup<T> {
  id: string;
  label: string;
  /** Draws the status square before the label. */
  status?: TaskStatus;
  /** Count after the label. Defaults to the number of items. */
  count?: number;
  items: readonly T[];
}

/** Moves the table's keyboard focus from outside it, for page shortcuts such as J and K. */
export interface DataTableHandle {
  /**
   * Moves to the next (1) or previous (-1) item row, skipping group rows, and puts focus in the table. With
   * selection on, the selection follows. Starts from the focused row when focus is in the table, otherwise
   * from the selected row; with neither, J goes to the first row and K to the last.
   */
  move: (step: 1 | -1) => void;
  /** Focuses the selected row, or selects and focuses the first item row when nothing is selected. */
  focus: () => void;
}

export interface DataTableProps<T> {
  'aria-label': string;
  columns: readonly DataColumn<T>[];
  /** Flat rows. Ignored when `groups` is set. */
  items?: readonly T[];
  /** Grouped rows with collapsible group headers (task list grouped by status). */
  groups?: readonly DataGroup<T>[];
  getKey: (item: T) => string;
  /**
   * Controlled single selection. Passing `onSelectionChange` turns selection on. The table never clears
   * the selection itself (collapsing the selected row's group keeps it selected).
   */
  selectedKey?: string | null;
  onSelectionChange?: (key: string, item: T) => void;
  /** Enter on a row (or double click). Enter on a group row toggles the group instead. */
  onRowAction?: (key: string, item: T) => void;
  collapsedGroups?: ReadonlySet<string>;
  defaultCollapsedGroups?: Iterable<string>;
  onCollapsedGroupsChange?: (collapsed: Set<string>) => void;
  /** Row height in px including the 1px divider: 35 for tasks, 49 for keys, 53 for members and projects. */
  rowHeight?: number;
  /**
   * Render only the visible rows. `auto` (default) virtualizes from 200 rows. The virtualized table
   * measures its container, so give the DataTable a bounded height (it fills its flex parent). Virtualized
   * rows have one fixed height (`rowHeight`, group rows included) so scrolling never measures the DOM, and
   * they render after hydration only.
   */
  virtualize?: boolean | 'auto';
  /** Loading state: header plus skeleton rows. */
  isLoading?: boolean;
  skeletonRows?: number;
  /** Rendered in the body when there are no rows (an error banner or a short message). */
  renderEmptyState?: () => ReactNode;
  /** Keep it stable (module level or memoized): a new function re-renders every row. */
  rowClassName?: (item: T) => string | undefined;
  className?: string;
  /** Imperative moves for page shortcuts (J and K pressed outside the table). */
  ref?: Ref<DataTableHandle>;
}

export const VIRTUALIZE_FROM = 200;
const HEADER_HEIGHT = 28;
const GROUP_HEIGHT = 31;
const EDGE = 24;
const GAP = 12;
// A control character keeps group keys apart from item keys. Not U+0000: React Aria finds rows with
// CSS.escape, which turns U+0000 into U+FFFD, so it could not find a group row to scroll to.
const GROUP_PREFIX = '\u001fgroup:';
/** Virtualized rows sit in sized wrappers; the row element itself must fill its wrapper. */
const VIRTUAL_ROW_STYLE: CSSProperties = { width: 'inherit', height: 'inherit' };

type ColumnSize = number | `${number}fr`;

interface GroupRow {
  id: string;
  type: 'group';
  groupId: string;
  label: string;
  status: TaskStatus | undefined;
  count: number;
  collapsed: boolean;
}
interface ItemRow<T> {
  id: string;
  type: 'item';
  item: T;
  /** Row id of the item's group row; null in a flat table. */
  groupRowId: string | null;
}
type RowModel<T> = GroupRow | ItemRow<T>;

interface RowCache<T> {
  items: WeakMap<object, ItemRow<T>>;
  groups: Map<string, GroupRow>;
  rows: RowModel<T>[];
}

function padding(index: number, count: number): { left: number; right: number } {
  const left = index === 0 ? EDGE : GAP / 2;
  const right = index === count - 1 ? EDGE : GAP / 2;
  return { left, right };
}

function cellPadding(index: number, count: number): CSSProperties {
  const { left, right } = padding(index, count);
  return { paddingLeft: left, paddingRight: right };
}

/** Column width including its share of the padding. */
function columnSize(width: number | `${number}fr`, index: number, count: number): ColumnSize {
  if (typeof width !== 'number') return width;
  const { left, right } = padding(index, count);
  return width + left + right;
}

function gridTemplate<T>(columns: readonly DataColumn<T>[]): string {
  return columns
    .map((column) =>
      typeof column.width === 'number'
        ? `${column.width}px`
        : `minmax(0,${Number.parseFloat(column.width)}fr)`,
    )
    .join(' ');
}

function useCollapsed(
  controlled: ReadonlySet<string> | undefined,
  initial: Iterable<string> | undefined,
  onChange: ((collapsed: Set<string>) => void) | undefined,
) {
  const [own, setOwn] = useState(() => new Set(initial ?? []));
  const collapsed = controlled ?? own;
  const latest = useRef({ collapsed, controlled, onChange });
  latest.current = { collapsed, controlled, onChange };
  const setGroup = useCallback((id: string, isCollapsed: boolean) => {
    const current = latest.current;
    if (current.collapsed.has(id) === isCollapsed) return;
    const next = new Set(current.collapsed);
    if (isCollapsed) next.add(id);
    else next.delete(id);
    // Quick presses may come before the re-render; later ones must start from this set.
    current.collapsed = next;
    if (!current.controlled) setOwn(next);
    current.onChange?.(next);
  }, []);
  return { collapsed, setGroup };
}

/**
 * Builds the row models, reusing the objects of rows that did not change. React Aria caches each row's
 * rendered element by row object, so a rebuilt list with the same items (a refetch with structural sharing,
 * a parent that rebuilds its groups) re-renders nothing.
 */
function buildRows<T>(
  cache: RowCache<T>,
  groups: readonly DataGroup<T>[] | undefined,
  items: readonly T[] | undefined,
  collapsed: ReadonlySet<string>,
  keyOf: (item: T) => string,
): RowModel<T>[] {
  const rows: RowModel<T>[] = [];
  const nextGroups = new Map<string, GroupRow>();
  const addItems = (list: readonly T[], groupRowId: string | null) => {
    for (const item of list) {
      const id = keyOf(item);
      const weak = typeof item === 'object' && item !== null ? (item as object) : null;
      let row = weak ? cache.items.get(weak) : undefined;
      if (!row || row.id !== id || row.groupRowId !== groupRowId) {
        row = { id, type: 'item', item, groupRowId };
        if (weak) cache.items.set(weak, row);
      }
      rows.push(row);
    }
  };
  if (groups) {
    for (const group of groups) {
      const id = GROUP_PREFIX + group.id;
      const isCollapsed = collapsed.has(group.id);
      const count = group.count ?? group.items.length;
      let row = cache.groups.get(id);
      if (
        !row ||
        row.label !== group.label ||
        row.status !== group.status ||
        row.count !== count ||
        row.collapsed !== isCollapsed
      ) {
        row = {
          id,
          type: 'group',
          groupId: group.id,
          label: group.label,
          status: group.status,
          count,
          collapsed: isCollapsed,
        };
      }
      nextGroups.set(id, row);
      rows.push(row);
      if (!isCollapsed) addItems(group.items, id);
    }
  } else if (items) {
    addItems(items, null);
  }
  cache.groups = nextGroups;
  // Same rows as last time: keep the old array, so the table below does not re-render at all.
  const previous = cache.rows;
  if (previous.length === rows.length && previous.every((row, index) => row === rows[index])) return previous;
  cache.rows = rows;
  return rows;
}

/** Index of the rows for keyboard moves. */
interface Navigation<T> {
  rows: readonly RowModel<T>[];
  indexById: Map<string, number>;
  itemsByKey: Map<string, T>;
  /** Item row ids, top to bottom. */
  itemIds: string[];
}

function indexRows<T>(rows: readonly RowModel<T>[]): Navigation<T> {
  const indexById = new Map<string, number>();
  const itemsByKey = new Map<string, T>();
  const itemIds: string[] = [];
  rows.forEach((row, index) => {
    indexById.set(row.id, index);
    if (row.type === 'item') {
      itemsByKey.set(row.id, row.item);
      itemIds.push(row.id);
    }
  });
  return { rows, indexById, itemsByKey, itemIds };
}

/** The item row a move lands on, or null to stay. Group rows are never a target. */
function moveTarget<T>(nav: Navigation<T>, from: string | null, step: 1 | -1): string | null {
  const index = from == null ? undefined : nav.indexById.get(from);
  if (index === undefined) return (step === 1 ? nav.itemIds[0] : nav.itemIds.at(-1)) ?? null;
  for (let i = index + step; i >= 0 && i < nav.rows.length; i += step) {
    const row = nav.rows[i];
    if (row?.type === 'item') return row.id;
  }
  return null;
}

/** First item row right under a group row (none when the group is collapsed or has no rows yet). */
function firstItemOf<T>(nav: Navigation<T>, groupRowId: string): string | null {
  const index = nav.indexById.get(groupRowId);
  if (index === undefined) return null;
  const next = nav.rows[index + 1];
  return next?.type === 'item' && next.groupRowId === groupRowId ? next.id : null;
}

type TableState = NonNullable<ContextType<typeof TableStateContext>>;

/**
 * Hands React Aria's table state to DataTable after every table commit. Rendered in the first column
 * header, which React Aria keeps rendered (virtualized too) and re-renders whenever the state changes.
 */
function TableStateBridge({ onCommit }: { onCommit: (state: TableState) => void }) {
  const state = useContext(TableStateContext);
  useLayoutEffect(() => {
    if (state) onCommit(state);
  });
  return null;
}

const isTyping = (target: EventTarget | null) =>
  target instanceof Element && target.closest('input, textarea, [contenteditable="true"]') != null;

type CellContentProps<T> = { column: DataColumn<T>; item: T };

/**
 * One cell's content. Memoized on the column and the item, so a row React Aria re-renders (selection,
 * focus) does not run the column's cell function again.
 */
const CellContent = memo(function CellContent({ column, item }: CellContentProps<unknown>) {
  return (
    <div
      className={cn('flex h-full min-w-0 items-center', column.align === 'end' && 'justify-end text-right')}
    >
      {column.cell(item)}
    </div>
  );
}) as unknown as <T>(props: CellContentProps<T>) => ReactNode;

/**
 * Keyboard-first table on React Aria Table.
 *
 * - Arrow keys and J/K move between rows; with selection on, the selection follows focus.
 * - In a grouped table, Up/Down and J/K skip group rows. Left collapses the focused row's group and puts
 *   focus on the group row; Right or Enter on a group row expands it and focuses its first row. Group rows
 *   are focusable (Left, a click, Tab), not selectable, and a click toggles them.
 * - Enter runs `onRowAction`. Esc is left to the page (closing the pane).
 * - Letters do not trigger type-ahead, so page shortcuts such as C and P keep working inside the table.
 * - Selection changes re-render no cell content: rows are cached by item and cells are memoized, so only
 *   React Aria's own row wrappers update.
 */
export function DataTable<T>(props: DataTableProps<T>) {
  const {
    columns,
    items,
    groups,
    getKey,
    selectedKey = null,
    onSelectionChange,
    onRowAction,
    rowHeight = 35,
    virtualize = 'auto',
    isLoading = false,
    skeletonRows = 10,
    renderEmptyState,
    rowClassName,
    className,
  } = props;
  const ariaLabel = props['aria-label'];
  const { collapsed, setGroup } = useCollapsed(
    props.collapsedGroups,
    props.defaultCollapsedGroups,
    props.onCollapsedGroupsChange,
  );

  // getKey is often an inline arrow; keep it out of the memo dependencies.
  const getKeyRef = useRef(getKey);
  getKeyRef.current = getKey;

  const cache = useRef<RowCache<T>>({ items: new WeakMap(), groups: new Map(), rows: [] });
  const rows = useMemo(
    () => buildRows(cache.current, groups, items, collapsed, getKeyRef.current),
    [groups, items, collapsed],
  );
  const nav = useMemo(() => indexRows(rows), [rows]);
  const groupKeys = useMemo(() => rows.filter((row) => row.type === 'group').map((row) => row.id), [rows]);
  const grouped = groups != null;

  // The virtualizer measures the DOM, so it only renders after hydration.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const isVirtualized = virtualize === 'auto' ? rows.length >= VIRTUALIZE_FROM : virtualize;
  const selectable = onSelectionChange != null;
  const selectedKeys = useMemo(() => (selectedKey ? [selectedKey] : []), [selectedKey]);
  const hasAction = onRowAction != null || groupKeys.length > 0;

  // Handlers read the latest props through a ref, so they stay stable and the table below can be memoized.
  const latest = useRef({ nav, onSelectionChange, onRowAction, selectable, setGroup });
  latest.current = { nav, onSelectionChange, onRowAction, selectable, setGroup };
  /** The selection last requested, ahead of the re-render (quick J presses each move one row). */
  const requested = useRef(selectedKey);
  const renderedSelection = useRef(selectedKey);
  if (renderedSelection.current !== selectedKey) {
    renderedSelection.current = selectedKey;
    requested.current = selectedKey;
  }

  const wrapperRef = useRef<HTMLDivElement>(null);
  /** React Aria's table state, as of the last table commit. */
  const tableState = useRef<TableState | null>(null);
  /** Group row whose first row gets focus once it has loaded (Right on a lazily loaded group). */
  const pendingGroup = useRef<string | null>(null);

  const select = useCallback((id: string) => {
    const { nav, onSelectionChange } = latest.current;
    const item = nav.itemsByKey.get(id);
    if (item === undefined || requested.current === id) return;
    requested.current = id;
    onSelectionChange?.(id, item);
  }, []);

  const handleSelection = useCallback(
    (keys: Selection) => {
      if (keys === 'all') return;
      const [key] = [...keys];
      // React Aria asks for an empty selection when a click lands on the selected row again or a group row.
      // Keep the current task selected instead; the page clears selection itself (Esc).
      if (key == null) return;
      select(String(key));
    },
    [select],
  );

  /** Focuses a row through React Aria (it scrolls the row in and renders it when virtualized). */
  const focusRow = useCallback(
    (id: string, { selectItem = true }: { selectItem?: boolean } = {}) => {
      const manager = tableState.current?.selectionManager;
      if (!manager) return;
      pendingGroup.current = null;
      manager.setFocused(true);
      manager.setFocusedKey(id);
      // React Aria moves DOM focus in an effect when the focused key changes. Focus a rendered row now too,
      // for the case where the key did not change (focus coming back from the search field).
      const element = [...(wrapperRef.current?.querySelectorAll<HTMLElement>('[role="row"]') ?? [])].find(
        (row) => row.dataset.key === id,
      );
      if (element && document.activeElement !== element) element.focus();
      if (selectItem && latest.current.selectable) select(id);
    },
    [select],
  );

  const toggleGroup = useCallback(
    (groupRowId: string, expand: boolean) => {
      const { nav, setGroup } = latest.current;
      const index = nav.indexById.get(groupRowId);
      const row = index === undefined ? undefined : nav.rows[index];
      if (row?.type !== 'group') return;
      if (!expand) {
        setGroup(row.groupId, true);
        return;
      }
      const first = firstItemOf(nav, groupRowId);
      if (first) {
        focusRow(first);
        return;
      }
      setGroup(row.groupId, false);
      // Its rows render (or load) after the re-render; onTableCommit focuses the first one.
      pendingGroup.current = groupRowId;
    },
    [focusRow],
  );

  const onTableCommit = useCallback(
    (state: TableState) => {
      tableState.current = state;
      const groupRowId = pendingGroup.current;
      if (!groupRowId) return;
      const { nav } = latest.current;
      if (!nav.indexById.has(groupRowId)) {
        pendingGroup.current = null;
        return;
      }
      // Wait until React Aria's collection has the row: it drops a focused key it does not know.
      const first = firstItemOf(nav, groupRowId);
      if (!first || !state.collection.getItem(first)) return;
      pendingGroup.current = null;
      // Only while focus is still in the table: rows that load late must not pull focus back.
      if (wrapperRef.current?.contains(document.activeElement)) focusRow(first);
    },
    [focusRow],
  );

  /** The row that has keyboard focus, when focus is in the table. */
  const focusedRow = useCallback((target: EventTarget | null): string | null => {
    const state = tableState.current;
    const focused = state?.selectionManager.focusedKey;
    if (focused != null) {
      const id = String(focused);
      if (latest.current.nav.indexById.has(id)) return id;
      // A cell: use its row.
      const parent = state?.collection.getItem(focused)?.parentKey;
      if (parent != null && latest.current.nav.indexById.has(String(parent))) return String(parent);
    }
    const row = target instanceof Element ? target.closest<HTMLElement>('[role="row"]') : null;
    return row?.dataset.key ?? null;
  }, []);

  const move = useCallback(
    (from: string | null, step: 1 | -1) => {
      const target = moveTarget(latest.current.nav, from, step);
      if (target) focusRow(target);
    },
    [focusRow],
  );

  useImperativeHandle(
    props.ref,
    () => ({
      move: (step) => {
        const inside = wrapperRef.current?.contains(document.activeElement) ?? false;
        move(inside ? focusedRow(document.activeElement) : requested.current, step);
      },
      focus: () => {
        const current = requested.current;
        if (current && latest.current.nav.indexById.has(current)) focusRow(current);
        else move(null, 1);
      },
    }),
    [move, focusRow, focusedRow],
  );

  const handleAction = useCallback((key: Key) => {
    const id = String(key);
    const { nav, onRowAction, setGroup } = latest.current;
    if (id.startsWith(GROUP_PREFIX)) {
      const groupId = id.slice(GROUP_PREFIX.length);
      const index = nav.indexById.get(id);
      const row = index === undefined ? undefined : nav.rows[index];
      setGroup(groupId, !(row?.type === 'group' && row.collapsed));
      return;
    }
    const item = nav.itemsByKey.get(id);
    if (item !== undefined) onRowAction?.(id, item);
  }, []);

  const onKeyDownCapture = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      if (isTyping(event.target)) return;
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      const target = event.target as HTMLElement;
      const done = () => {
        event.preventDefault();
        event.stopPropagation();
      };
      if (!grouped) {
        // J and K behave like the arrow keys. Re-dispatching keeps React Aria's own focus, scrolling and
        // virtualization logic in charge of the move.
        if (key !== 'j' && key !== 'k') return;
        done();
        const arrow = key === 'j' ? 'ArrowDown' : 'ArrowUp';
        target.dispatchEvent(
          new globalThis.KeyboardEvent('keydown', {
            key: arrow,
            code: arrow,
            bubbles: true,
            cancelable: true,
          }),
        );
        return;
      }
      // Only keys pressed on the rows; an empty state's buttons keep their own keys.
      if (!target.closest('[role="grid"]')) return;
      const { nav } = latest.current;
      const current = focusedRow(target);
      const index = current == null ? undefined : nav.indexById.get(current);
      const row = index === undefined ? undefined : nav.rows[index];
      switch (key) {
        case 'ArrowDown':
        case 'j':
          done();
          move(current, 1);
          return;
        case 'ArrowUp':
        case 'k':
          done();
          move(current, -1);
          return;
        case 'ArrowLeft':
          // Rows only: React Aria's cell focus has no use here.
          done();
          if (row?.type === 'item' && row.groupRowId) {
            // Focus the group row first, so React Aria does not move focus when the task row goes away.
            focusRow(row.groupRowId, { selectItem: false });
            toggleGroup(row.groupRowId, false);
          } else if (row?.type === 'group' && !row.collapsed) {
            toggleGroup(row.id, false);
          }
          return;
        case 'ArrowRight':
          done();
          if (row?.type === 'group') toggleGroup(row.id, true);
          return;
        case 'Enter':
          if (row?.type !== 'group') return;
          done();
          toggleGroup(row.id, row.collapsed);
          return;
        default:
          return;
      }
    },
    [grouped, focusedRow, move, focusRow, toggleGroup],
  );

  const count = columns.length;
  const rowStyle = isVirtualized ? VIRTUAL_ROW_STYLE : undefined;

  const header = useMemo(
    () => (
      <TableHeader className="bg-bg" style={rowStyle}>
        {columns.map((column, index) => (
          <Column
            key={column.id}
            id={column.id}
            textValue={column.header}
            isRowHeader={column.isRowHeader}
            width={isVirtualized ? columnSize(column.width, index, count) : undefined}
            style={{
              ...cellPadding(index, count),
              ...(isVirtualized
                ? {}
                : {
                    width:
                      typeof column.width === 'number' ? columnSize(column.width, index, count) : undefined,
                  }),
            }}
            className={cn(
              'caps h-7 truncate border-b border-line bg-bg text-left align-middle outline-none focus-visible:focus-ring-inset',
              !isVirtualized && 'sticky top-0 z-10',
              isVirtualized && 'flex items-center',
              column.align === 'end' && 'justify-end text-right',
            )}
          >
            {index === 0 ? <TableStateBridge onCommit={onTableCommit} /> : null}
            {column.header}
          </Column>
        ))}
      </TableHeader>
    ),
    [columns, count, isVirtualized, rowStyle, onTableCommit],
  );

  const renderRow = useCallback(
    (row: RowModel<T>) => {
      if (row.type === 'group') {
        return (
          <Row
            id={row.id}
            style={rowStyle}
            className="cursor-pointer bg-band outline-none focus-visible:focus-ring-inset"
            data-group-row=""
          >
            <Cell
              colSpan={count}
              className={cn(
                'border-b border-line-2 outline-none focus-visible:focus-ring-inset',
                !isVirtualized && 'align-middle',
              )}
              style={{
                height: isVirtualized ? rowHeight : GROUP_HEIGHT,
                paddingLeft: EDGE,
                paddingRight: EDGE,
              }}
            >
              <div className="flex h-full items-center gap-2.5 text-[11px] font-semibold tracking-[0.06em] uppercase">
                {row.status ? <StatusSquare status={row.status} withLabel={false} /> : null}
                <span>{row.label}</span>
                <span className="font-mono text-[10px] tracking-normal text-faint">{row.count}</span>
                <span className="sr-only">{row.collapsed ? ', collapsed' : ', expanded'}</span>
              </div>
            </Cell>
          </Row>
        );
      }
      const { item } = row;
      return (
        <Row
          id={row.id}
          columns={columns}
          style={rowStyle}
          className={cn(
            'cursor-default outline-none hover:bg-band selected:bg-sel focus-visible:focus-ring-inset',
            rowClassName?.(item),
          )}
        >
          {(column) => {
            const index = columns.indexOf(column);
            return (
              <Cell
                className={cn(
                  'border-b border-line-2 outline-none focus-visible:focus-ring-inset',
                  !isVirtualized && 'align-middle',
                )}
                style={{ ...cellPadding(index, count), height: rowHeight }}
              >
                <CellContent column={column} item={item} />
              </Cell>
            );
          }}
        </Row>
      );
    },
    [columns, count, isVirtualized, rowClassName, rowHeight, rowStyle],
  );

  // The empty state only renders without rows; leaving it out otherwise keeps an inline function from
  // re-rendering the table on every parent render.
  const emptyState = rows.length ? undefined : renderEmptyState;
  const bodyDependencies = useMemo(
    () => [columns, rowClassName, rowHeight, isVirtualized],
    [columns, rowClassName, rowHeight, isVirtualized],
  );

  // Its own element, so a selection change does not re-create it: React Aria re-registers a re-created
  // collection element's props during the commit, which clones the collection and renders the table twice.
  const body = useMemo(
    () => (
      <TableBody items={rows} dependencies={bodyDependencies} renderEmptyState={emptyState}>
        {renderRow}
      </TableBody>
    ),
    [rows, bodyDependencies, emptyState, renderRow],
  );

  // A parent re-render that changes none of these (the URL catching up with the selection, a pane update)
  // leaves React Aria's table alone.
  const table = useMemo(
    () => (
      <Table
        aria-label={ariaLabel}
        selectionMode={selectable ? 'single' : 'none'}
        selectionBehavior="replace"
        selectedKeys={selectable ? selectedKeys : undefined}
        onSelectionChange={selectable ? handleSelection : undefined}
        disabledKeys={groupKeys}
        disabledBehavior="selection"
        escapeKeyBehavior="none"
        onRowAction={hasAction ? handleAction : undefined}
        className={cn(
          'border-separate border-spacing-0 outline-none',
          isVirtualized ? 'size-full overflow-auto' : 'w-full table-fixed',
        )}
      >
        {header}
        {body}
      </Table>
    ),
    [
      ariaLabel,
      selectable,
      selectedKeys,
      handleSelection,
      groupKeys,
      hasAction,
      handleAction,
      isVirtualized,
      header,
      body,
    ],
  );

  const layoutOptions = useMemo(() => ({ rowHeight, headingHeight: HEADER_HEIGHT }), [rowHeight]);

  if (isLoading) {
    return (
      <div className={cn('flex min-h-0 flex-1 flex-col', className)} aria-busy="true">
        <div
          className="grid h-7 shrink-0 items-center gap-3 border-b border-line px-6"
          style={{ gridTemplateColumns: gridTemplate(columns) }}
        >
          {columns.map((column) => (
            <span key={column.id} className={cn('caps truncate', column.align === 'end' && 'text-right')}>
              {column.header}
            </span>
          ))}
        </div>
        {Array.from({ length: skeletonRows }, (_, row) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder rows
            key={row}
            className="grid shrink-0 items-center gap-3 border-b border-line-2 px-6"
            style={{ gridTemplateColumns: gridTemplate(columns), height: rowHeight }}
          >
            {columns.map((column, index) => (
              <Skeleton
                key={column.id}
                width={
                  column.skeleton ??
                  (typeof column.width === 'number' ? '60%' : `${55 + ((row * 7 + index * 13) % 35)}%`)
                }
              />
            ))}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      ref={wrapperRef}
      className={cn('relative min-h-0 flex-1', !isVirtualized && 'overflow-auto', className)}
      onKeyDownCapture={onKeyDownCapture}
      data-virtualized={isVirtualized || undefined}
    >
      {isVirtualized && !hydrated ? null : isVirtualized ? (
        // The virtualizer measures the table, so it gets an explicit box.
        <div className="absolute inset-0">
          <Virtualizer layout={TableLayout} layoutOptions={layoutOptions}>
            {table}
          </Virtualizer>
        </div>
      ) : (
        table
      )}
    </div>
  );
}
