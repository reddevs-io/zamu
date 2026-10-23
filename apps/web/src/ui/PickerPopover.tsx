import { type ReactNode, type RefObject, useId, useState } from 'react';
import {
  Autocomplete,
  Input,
  Menu,
  MenuItem,
  MenuTrigger,
  type PopoverProps,
  SearchField,
  useFilter,
} from 'react-aria-components';
import { cn } from './cn';
import { Kbd } from './Kbd';
import { Popover } from './ListBox';

/** One option of a milestone, cycle or mention picker. */
export interface PickerItem {
  id: string;
  label: string;
  /** Glyph or avatar before the label. */
  lead?: ReactNode;
  /** Muted text right after the label: "current · 3d left", "agent · for Ana Ruiz". */
  sub?: string;
  /** Trailing mono text: "Nov 14", "–". */
  meta?: string;
  /** `warn` draws the meta in --warn (overdue target date). */
  metaTone?: 'default' | 'warn';
  /** Text matched by the search. Defaults to the label. */
  textValue?: string;
  isDisabled?: boolean;
}

/** Key of the "none" item in the menu. onChange receives null for it. */
export const PICKER_NONE = '__none__';

const rowClass = 'flex h-8 min-w-0 items-center gap-2 px-2.5 text-[12.5px] text-fg';

function PickerRowContent({
  item,
  isCurrent,
  hint,
}: {
  item: PickerItem;
  isCurrent?: boolean;
  hint?: string;
}) {
  return (
    <>
      {item.lead ? (
        <span className="flex w-[18px] shrink-0 items-center justify-center">{item.lead}</span>
      ) : null}
      <span className={cn('min-w-0 truncate', hint && 'font-semibold')}>{item.label}</span>
      {item.sub ? <span className="shrink-0 truncate text-[11.5px] text-muted">{item.sub}</span> : null}
      <span className="flex-1" />
      {item.meta ? (
        <span
          className={cn(
            'shrink-0 font-mono text-[10.5px] whitespace-nowrap',
            item.metaTone === 'warn' ? 'text-warn' : 'text-muted',
          )}
        >
          {item.meta}
        </span>
      ) : null}
      {isCurrent ? (
        <span aria-hidden className="w-3 shrink-0 text-center text-accent">
          ✓
        </span>
      ) : null}
      {hint ? <Kbd aria-hidden>{hint}</Kbd> : null}
    </>
  );
}

export interface PickerPopoverProps {
  /** Accessible name of the menu: "Milestone", "Cycle". */
  'aria-label': string;
  items: readonly PickerItem[];
  /** id of the current value, or null when none is set. */
  value: string | null;
  /** Picked id, or null for the "none" item. The popover closes. */
  onChange: (value: string | null) => void;
  /** First item that clears the value: { label: 'No milestone', glyph: <NoneGlyph /> }. */
  none?: { label: string; glyph?: ReactNode };
  /** Search field placeholder: "Set milestone…". */
  searchPlaceholder?: string;
  /** Shortcut shown at the right of the search field: "⇧M". */
  kbd?: string;
  /** Shown when the search matches nothing. */
  emptyText?: string;
  /** Under the list, after a separator. */
  footer?: ReactNode;
  /** The trigger: a Button or another React Aria pressable. */
  children: ReactNode;
  /** Controlled open state, for opening from a shortcut (Shift+M). */
  isOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  /** Anchor element when it differs from the trigger (the property cell). */
  triggerRef?: RefObject<Element | null>;
  placement?: PopoverProps['placement'];
  /** Popover width in px (default 300). */
  width?: number;
}

/**
 * Searchable menu (React Aria Autocomplete + Menu) for milestone and cycle pickers: search field with an
 * optional shortcut hint, an optional "none" item first, a check on the current value, trailing meta text.
 * Type to filter; arrow keys move; Enter picks.
 */
export function PickerPopover({
  items,
  value,
  onChange,
  none,
  searchPlaceholder = 'Search…',
  kbd,
  emptyText = 'No matches',
  footer,
  children,
  isOpen,
  onOpenChange,
  triggerRef,
  placement = 'bottom start',
  width = 300,
  ...props
}: PickerPopoverProps) {
  const { contains } = useFilter({ sensitivity: 'base' });
  const [innerOpen, setInnerOpen] = useState(false);
  const open = isOpen ?? innerOpen;
  const setOpen = (next: boolean) => {
    if (isOpen === undefined) setInnerOpen(next);
    onOpenChange?.(next);
  };
  const allItems: PickerItem[] = none
    ? [{ id: PICKER_NONE, label: none.label, lead: none.glyph }, ...items]
    : [...items];
  const current = value ?? (none ? PICKER_NONE : null);
  return (
    <MenuTrigger isOpen={open} onOpenChange={setOpen} trigger="press">
      {children}
      <Popover
        placement={placement}
        triggerRef={triggerRef}
        className="min-w-0 overflow-hidden"
        style={{ width }}
      >
        <Autocomplete filter={contains}>
          <SearchField
            aria-label={searchPlaceholder.replace(/…$/, '')}
            autoFocus
            onKeyDown={(event) => {
              // The search field eats Escape; the first one clears the text, the next one closes.
              if (event.key === 'Escape' && (event.target as HTMLInputElement).value === '') setOpen(false);
            }}
            className="flex items-center gap-2 border-b border-line-2 px-2.5 py-2"
          >
            <Input
              placeholder={searchPlaceholder}
              className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[12.5px] text-fg outline-none placeholder:text-faint [&::-webkit-search-cancel-button]:hidden"
            />
            {kbd ? <Kbd aria-hidden>{kbd}</Kbd> : null}
          </SearchField>
          <Menu
            aria-label={props['aria-label']}
            items={allItems}
            selectionMode="single"
            selectedKeys={current != null ? [current] : []}
            onAction={(key) => onChange(key === PICKER_NONE ? null : String(key))}
            renderEmptyState={() => <div className="px-2.5 py-2 text-[12px] text-faint">{emptyText}</div>}
            className="max-h-72 overflow-auto outline-none"
          >
            {(item) => (
              <MenuItem
                id={item.id}
                textValue={item.textValue ?? item.label}
                isDisabled={item.isDisabled}
                className={cn(
                  rowClass,
                  'cursor-pointer outline-none select-none focus:bg-sel selected:bg-sel disabled:opacity-50',
                )}
              >
                <PickerRowContent item={item} isCurrent={item.id === current} />
              </MenuItem>
            )}
          </Menu>
        </Autocomplete>
        {footer ? (
          <div className="border-t border-line-2 px-2.5 pt-1 pb-2 text-[11px] text-faint">{footer}</div>
        ) : null}
      </Popover>
    </MenuTrigger>
  );
}

// ── Controlled list for pickers driven from a text field (mentions) ─────────────────────────────────

export interface PickerListProps {
  /** id of the listbox; point the textarea's aria-controls at it. */
  id?: string;
  /** Caps header: "Mention · cl". */
  title?: ReactNode;
  'aria-label': string;
  items: readonly PickerItem[];
  /** Highlighted option (moved by the text field's arrow keys). */
  activeId: string | null;
  /** Click or Enter on an option. */
  onSelect: (id: string) => void;
  /** Pointer moved over an option. */
  onActiveChange?: (id: string) => void;
  /** Kbd hint drawn on the active option (default "↵"). */
  activeHint?: string;
  /** Under the list, after a separator: "No notifications yet. A mention links to the member." */
  footer?: ReactNode;
  emptyText?: string;
  /** Position it with classes, for example "absolute bottom-full left-0 mb-1 w-80". */
  className?: string;
}

/** DOM id of an option, for the text field's aria-activedescendant. */
export function pickerOptionId(listId: string, itemId: string): string {
  return `${listId}-option-${itemId}`;
}

/**
 * Popover-styled listbox that never takes focus: the text field keeps it and drives `activeId` with
 * movePickerActive. The mention picker in the composer uses it.
 */
export function PickerList({
  id,
  title,
  items,
  activeId,
  onSelect,
  onActiveChange,
  activeHint = '↵',
  footer,
  emptyText = 'No matches',
  className,
  ...props
}: PickerListProps) {
  const fallbackId = useId();
  const listId = id ?? fallbackId;
  return (
    <div className={cn('z-10 flex flex-col border border-line bg-surface text-fg shadow-dialog', className)}>
      {title ? (
        <div aria-hidden className="caps border-b border-line-2 px-2.5 py-[7px]">
          {title}
        </div>
      ) : null}
      <div id={listId} role="listbox" aria-label={props['aria-label']} className="max-h-72 overflow-auto">
        {items.length === 0 ? (
          <div className="px-2.5 py-2 text-[12px] text-faint">{emptyText}</div>
        ) : (
          items.map((item) => {
            const isActive = item.id === activeId;
            return (
              // The text field keeps focus and drives the active option (aria-activedescendant), so options
              // are neither focusable nor keyboard targets themselves.
              // biome-ignore lint/a11y/useFocusableInteractive: aria-activedescendant listbox option.
              // biome-ignore lint/a11y/useKeyWithClickEvents: keys are handled by the text field.
              <div
                key={item.id}
                id={pickerOptionId(listId, item.id)}
                role="option"
                aria-selected={isActive}
                aria-disabled={item.isDisabled || undefined}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => onActiveChange?.(item.id)}
                onClick={() => {
                  if (!item.isDisabled) onSelect(item.id);
                }}
                className={cn(
                  rowClass,
                  'cursor-pointer',
                  isActive && 'bg-sel',
                  item.isDisabled && 'opacity-50',
                )}
              >
                <PickerRowContent item={item} hint={isActive ? activeHint : undefined} />
              </div>
            );
          })
        )}
      </div>
      {footer ? (
        <div className="mt-1 border-t border-line-2 px-2.5 pt-1 pb-2 text-[11px] text-faint">{footer}</div>
      ) : null}
    </div>
  );
}

/** Next active id after an arrow key: `delta` 1 (down) or -1 (up), wrapping, skipping disabled items. */
export function movePickerActive(
  items: readonly PickerItem[],
  activeId: string | null,
  delta: 1 | -1,
): string | null {
  const enabled = items.filter((item) => !item.isDisabled);
  if (!enabled.length) return null;
  const index = enabled.findIndex((item) => item.id === activeId);
  if (index === -1) return (delta === 1 ? enabled[0] : enabled[enabled.length - 1])?.id ?? null;
  return enabled[(index + delta + enabled.length) % enabled.length]?.id ?? null;
}

/** Case- and accent-insensitive "contains" filter on textValue or label. */
export function filterPickerItems(items: readonly PickerItem[], query: string): PickerItem[] {
  const needle = normalize(query.trim());
  if (!needle) return [...items];
  return items.filter((item) => normalize(item.textValue ?? item.label).includes(needle));
}

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}
