import { type KeyboardEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
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
   * the selection itself (focus passing over a group row keeps the current task selected).
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
  rowClassName?: (item: T) => string | undefined;
  className?: string;
}

export const VIRTUALIZE_FROM = 200;
const HEADER_HEIGHT = 28;
const GROUP_HEIGHT = 31;
const EDGE = 24;
const GAP = 12;
const GROUP_PREFIX = '\u0000group:';

type ColumnSize = number | `${number}fr`;

type RowModel<T> =
  | { id: string; type: 'group'; group: DataGroup<T>; collapsed: boolean }
  | { id: string; type: 'item'; item: T };

function padding(index: number, count: number): { left: number; right: number } {
  const left = index === 0 ? EDGE : GAP / 2;
  const right = index === count - 1 ? EDGE : GAP / 2;
  return { left, right };
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
  const toggle = (id: string) => {
    const next = new Set(collapsed);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    if (!controlled) setOwn(next);
    onChange?.(next);
  };
  return { collapsed, toggle };
}

/**
 * Keyboard-first table on React Aria Table.
 *
 * - Arrow keys and J/K move between rows; with selection on, the selection follows focus.
 * - Enter runs `onRowAction` (or toggles a group row). Esc is left to the page (closing the pane).
 * - Letters do not trigger type-ahead, so page shortcuts such as C and P keep working inside the table.
 * - Group rows are focusable, not selectable, and collapse with Enter or a click.
 */
export function DataTable<T>(props: DataTableProps<T>) {
  const {
    columns,
    items,
    groups,
    getKey,
    selectedKey,
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
  const { collapsed, toggle } = useCollapsed(
    props.collapsedGroups,
    props.defaultCollapsedGroups,
    props.onCollapsedGroupsChange,
  );

  // getKey is often an inline arrow; keep it out of the memo dependencies.
  const getKeyRef = useRef(getKey);
  getKeyRef.current = getKey;

  const { rows, itemsByKey, groupKeys } = useMemo(() => {
    const keyOf = getKeyRef.current;
    const rows: RowModel<T>[] = [];
    const itemsByKey = new Map<string, T>();
    const groupKeys: string[] = [];
    const addItems = (list: readonly T[]) => {
      for (const item of list) {
        const id = keyOf(item);
        itemsByKey.set(id, item);
        rows.push({ id, type: 'item', item });
      }
    };
    if (groups) {
      for (const group of groups) {
        const id = GROUP_PREFIX + group.id;
        const isCollapsed = collapsed.has(group.id);
        groupKeys.push(id);
        rows.push({ id, type: 'group', group, collapsed: isCollapsed });
        if (!isCollapsed) addItems(group.items);
      }
    } else if (items) {
      addItems(items);
    }
    return { rows, itemsByKey, groupKeys };
  }, [groups, items, collapsed]);

  // The virtualizer measures the DOM, so it only renders after hydration.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const isVirtualized = virtualize === 'auto' ? rows.length >= VIRTUALIZE_FROM : virtualize;
  const selectable = onSelectionChange != null;
  const selectedKeys = useMemo(() => (selectedKey ? [selectedKey] : []), [selectedKey]);

  const handleSelection = (keys: Selection) => {
    if (keys === 'all') return;
    const [key] = [...keys];
    // Moving focus onto a group row asks React Aria to select it, which yields an empty selection.
    // Keep the current task selected instead; the page clears selection itself (Esc).
    if (key == null) return;
    const id = String(key);
    const item = itemsByKey.get(id);
    if (item === undefined) return;
    onSelectionChange?.(id, item);
  };

  const handleAction = (key: Key) => {
    const id = String(key);
    if (id.startsWith(GROUP_PREFIX)) {
      toggle(id.slice(GROUP_PREFIX.length));
      return;
    }
    const item = itemsByKey.get(id);
    if (item !== undefined) onRowAction?.(id, item);
  };

  // J and K behave like the arrow keys. Re-dispatching keeps React Aria's own focus, scrolling and
  // virtualization logic in charge of the move.
  const onKeyDownCapture = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    const key = event.key.toLowerCase();
    if (key !== 'j' && key !== 'k') return;
    const target = event.target as HTMLElement;
    if (target.closest('input, textarea, [contenteditable="true"]')) return;
    event.preventDefault();
    event.stopPropagation();
    const arrow = key === 'j' ? 'ArrowDown' : 'ArrowUp';
    target.dispatchEvent(
      new globalThis.KeyboardEvent('keydown', { key: arrow, code: arrow, bubbles: true, cancelable: true }),
    );
  };

  const count = columns.length;
  // Virtualized rows sit in sized wrappers; the row element itself must fill its wrapper.
  const rowStyle = isVirtualized ? { width: 'inherit', height: 'inherit' } : undefined;
  const cellPadding = (index: number) => {
    const { left, right } = padding(index, count);
    return { paddingLeft: left, paddingRight: right };
  };

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

  const table = (
    <Table
      aria-label={props['aria-label']}
      selectionMode={selectable ? 'single' : 'none'}
      selectionBehavior="replace"
      selectedKeys={selectable ? selectedKeys : undefined}
      onSelectionChange={selectable ? handleSelection : undefined}
      disabledKeys={groupKeys}
      disabledBehavior="selection"
      escapeKeyBehavior="none"
      onRowAction={onRowAction || groupKeys.length ? handleAction : undefined}
      className={cn(
        'border-separate border-spacing-0 outline-none',
        isVirtualized ? 'size-full overflow-auto' : 'w-full table-fixed',
      )}
    >
      <TableHeader className="bg-bg" style={rowStyle}>
        {columns.map((column, index) => (
          <Column
            key={column.id}
            id={column.id}
            isRowHeader={column.isRowHeader}
            width={isVirtualized ? columnSize(column.width, index, count) : undefined}
            style={{
              ...cellPadding(index),
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
            {column.header}
          </Column>
        ))}
      </TableHeader>
      <TableBody
        items={rows}
        dependencies={[columns, rowClassName, rowHeight]}
        renderEmptyState={renderEmptyState}
      >
        {(row) => {
          if (row.type === 'group') {
            const { group } = row;
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
                    {group.status ? <StatusSquare status={group.status} withLabel={false} /> : null}
                    <span>{group.label}</span>
                    <span className="font-mono text-[10px] tracking-normal text-faint">
                      {group.count ?? group.items.length}
                    </span>
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
                    style={{ ...cellPadding(index), height: rowHeight }}
                  >
                    <div
                      className={cn(
                        'flex h-full min-w-0 items-center',
                        column.align === 'end' && 'justify-end text-right',
                      )}
                    >
                      {column.cell(item)}
                    </div>
                  </Cell>
                );
              }}
            </Row>
          );
        }}
      </TableBody>
    </Table>
  );

  return (
    <div
      className={cn('relative min-h-0 flex-1', !isVirtualized && 'overflow-auto', className)}
      onKeyDownCapture={onKeyDownCapture}
      data-virtualized={isVirtualized || undefined}
    >
      {isVirtualized && !hydrated ? null : isVirtualized ? (
        // The virtualizer measures the table, so it gets an explicit box.
        <div className="absolute inset-0">
          <Virtualizer layout={TableLayout} layoutOptions={{ rowHeight, headingHeight: HEADER_HEIGHT }}>
            {table}
          </Virtualizer>
        </div>
      ) : (
        table
      )}
    </div>
  );
}
