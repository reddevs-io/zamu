import type { CSSProperties, ReactNode } from 'react';
import type { Key } from 'react-aria-components';
import { cn } from './cn';
import { type OptionItem, OptionLead } from './ListBox';
import { Select } from './Select';

/*
 * Mapping of Backlog.md values (statuses, priorities, assignees) to the app's values
 * (ledger-m3.css .m3-map, .m3-maprow; the settings summary is .ps-mrow).
 */

export type MappingHow = 'name' | 'fallback' | 'manual';

export interface MappingTableProps {
  /** Accessible name: "Status mapping". */
  'aria-label': string;
  /**
   * `edit` (default): bordered table of selects for setup and Edit mappings.
   * `summary`: borderless read-only rows for the Backlog.md settings section.
   */
  variant?: 'edit' | 'summary';
  /** Column captions of the edit table. Pass `null` to leave the caption row out. */
  columns?: { from: string; to: string; count: string } | null;
  /** Width of the "Here" select column in px (edit only): 210 for statuses, 150 priorities, 170 assignees. */
  selectWidth?: number;
  /** Width of the count column in px (edit only). */
  countWidth?: number;
  /** MappingRow elements. */
  children: ReactNode;
  className?: string;
}

export function MappingTable({
  variant = 'edit',
  columns = { from: 'In the files', to: 'Here', count: 'Tasks' },
  selectWidth = 210,
  countWidth = 64,
  children,
  className,
  ...props
}: MappingTableProps) {
  const cols =
    variant === 'edit'
      ? `minmax(0,1fr) 20px ${selectWidth}px ${countWidth}px`
      : 'minmax(0,200px) 18px minmax(0,1fr) auto';
  return (
    <fieldset
      aria-label={props['aria-label']}
      data-variant={variant}
      style={{ '--map-cols': cols } as CSSProperties}
      className={cn(
        'm-0 flex min-w-0 flex-col border-0 p-0',
        variant === 'edit' && 'overflow-hidden rounded-md border border-line bg-surface',
        className,
      )}
    >
      {variant === 'edit' && columns ? (
        <div
          aria-hidden
          className="grid h-7 grid-cols-(--map-cols) items-center gap-3 border-b border-line px-3 text-xs font-medium text-fg-3"
        >
          <span>{columns.from}</span>
          <span />
          <span>{columns.to}</span>
          <span className="text-right">{columns.count}</span>
        </div>
      ) : null}
      {children}
    </fieldset>
  );
}

export interface MappingRowProps {
  /** The value as written in the files: "In Progress", "high", "@claude". Mono. */
  from: string;
  /** App values to pick from (with StatusSquare, PriorityGlyph or avatar leads). */
  items: readonly OptionItem[];
  /** Id of the picked item; null shows `placeholder`. */
  value: Key | null;
  onChange?: (value: Key) => void;
  /**
   * How the value was picked: `name` shows "by name", `fallback` turns the select --danger and says
   * "fallback", `manual` shows nothing.
   */
  how?: MappingHow;
  /** Show the "by name" / "fallback" note (assignee tables leave it out). Defaults to true. */
  showHow?: boolean;
  /** Tasks using this value. */
  count: number | string;
  /** Read-only rendering, used by the `summary` table. */
  isReadOnly?: boolean;
  isDisabled?: boolean;
  placeholder?: string;
  /** Forces the focused look (gallery). */
  isFocused?: boolean;
  className?: string;
}

/** One row: the file value, an arrow, the select (or the read-only value) and the task count. */
export function MappingRow({
  from,
  items,
  value,
  onChange,
  how = 'manual',
  showHow = true,
  count,
  isReadOnly = false,
  isDisabled,
  placeholder = 'Pick a value',
  isFocused = false,
  className,
}: MappingRowProps) {
  const isFallback = how === 'fallback';
  const note =
    showHow && how !== 'manual' ? (
      <span
        className={cn(
          'shrink-0 text-xs whitespace-nowrap',
          isFallback ? 'font-semibold text-danger' : 'text-fg-3',
        )}
      >
        {isFallback ? 'fallback' : 'by name'}
      </span>
    ) : null;
  const selected = items.find((item) => item.id === value);
  const countText = typeof count === 'number' ? count.toLocaleString('en-US') : count;

  return (
    <div
      data-how={how}
      className={cn(
        'grid grid-cols-(--map-cols) items-center border-b border-line-soft last:border-b-0',
        isReadOnly ? 'gap-2.5 py-1.5 text-sm' : 'min-h-10 gap-3 px-3',
        className,
      )}
    >
      <span title={from} className="truncate font-mono text-xs text-fg">
        {from}
      </span>
      <span aria-hidden className="text-center text-fg-3">
        →
      </span>
      {isReadOnly ? (
        <span className="flex min-w-0 items-center gap-1.75">
          {selected ? <OptionLead item={selected} /> : null}
          <span className="truncate">{selected?.label ?? placeholder}</span>
          {isFallback && showHow ? note : null}
        </span>
      ) : (
        <Select
          variant="cell"
          aria-label={`${from} maps to`}
          items={items}
          value={value}
          onChange={(key) => {
            if (key != null) onChange?.(key);
          }}
          placeholder={placeholder}
          tone={isFallback ? 'warn' : 'default'}
          trailing={note}
          isDisabled={isDisabled}
          triggerClassName={isFocused ? 'border-accent shadow-[0_0_0_3px_var(--accent-soft)]' : undefined}
        />
      )}
      <span className="text-right font-mono text-xs text-fg-2">{countText}</span>
    </div>
  );
}
