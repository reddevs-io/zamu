import {
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Button as AriaButton,
  type ButtonProps as AriaButtonProps,
  Menu as AriaMenu,
  MenuItem as AriaMenuItem,
  MenuSection as AriaMenuSection,
  Autocomplete,
  Header,
  Input,
  type Key,
  MenuTrigger,
  type PopoverProps,
  SearchField,
  type Selection,
  Text,
  useFilter,
} from 'react-aria-components';
import { CheckboxBox } from './Checkbox';
import { cn } from './cn';
import { CheckGlyph, CloseGlyph, PlusGlyph } from './Glyphs';
import { Kbd, KeyHint } from './Kbd';
import { Popover } from './ListBox';
import { useInDocument } from './useInDocument';

/*
 * The generic picker menu (components.md "Menu", frames 071–079; margin.css .menu, .menu-in, .menu-i,
 * .menu-h, .menu-sep, .menu-note, .menu-foot). Built on React Aria Autocomplete + Menu: the search field
 * keeps DOM focus and moves a virtual focus through the items (aria-activedescendant), so typing filters,
 * ↑/↓ move, Enter picks or toggles, and a screen reader hears the highlighted item.
 *
 *   <PickerMenuPopover>  trigger + popover + PickerMenu (the usual way to open a picker)
 *   <PickerMenu>         the panel itself (embedded, or in the gallery)
 *   MenuNote, MenuTip, MenuFooter, MenuRowButton: pieces for content around the list
 */

export interface PickerMenuItem {
  id: string;
  /** Visible label. Also the text the search matches unless `textValue` is set. */
  label: string;
  /** Text the search matches: label plus key, for example "PAY-150 Payout status webhooks". */
  textValue?: string;
  /** Glyph before the label: StatusGlyph, PriorityGlyph, LabelDot, Avatar. */
  lead?: ReactNode;
  /** Task key in a 58px column before the label: "PAY-150". */
  taskKey?: string;
  /** Muted text after the label: "for Ana". */
  sub?: ReactNode;
  /** Muted text on the right: a usage count, "Wed, Nov 4". */
  meta?: ReactNode;
  /** Node at the far right, before the check: an assignee avatar. */
  trailing?: ReactNode;
  /** With `numberKeys`: the digit that picks this item ("1"–"6", "0"–"4"). Drawn as a key hint. */
  numberKey?: string;
  /**
   * `dim`: --fg-3 text (Canceled, a refused result). `done`: struck title (a done blocker).
   * `gone`: italic --fg-3 ("Removed task").
   */
  tone?: 'default' | 'dim' | 'done' | 'gone';
  /**
   * Why this item can't be picked: "Can't add: PAY-150 already waits on PAY-142." Drawn under the item in the
   * danger note and read with it (aria-describedby). The item stays reachable but does nothing.
   */
  refusal?: ReactNode;
  /** Draws a × and lets Backspace (with an empty search) or a click on × call `onRemove`. */
  removable?: boolean;
  isDisabled?: boolean;
}

export interface PickerMenuSection {
  id: string;
  /** Section header: "On this task", "All labels in Payments · 30", "Agents". */
  title?: ReactNode;
  items: readonly PickerMenuItem[];
  /** `false`: the search doesn't filter this section (the current blockers stay while you search). */
  filter?: boolean;
}

export interface PickerMenuCreate {
  /** The create item's label for the typed text: q => `Create label “${q}”`. */
  label: (query: string) => string;
  /** Header over the create item when nothing else matches: q => `No label named “${q}” in Payments`. */
  emptyTitle?: (query: string) => ReactNode;
  /** `enter` (default): Enter on the highlighted create item. `mod-enter`: ⌘↵ creates from anywhere (subtasks). */
  trigger?: 'enter' | 'mod-enter';
  onCreate: (query: string) => void;
}

export interface MenuFooterHint {
  keys: string | readonly string[];
  label: string;
}

export interface PickerMenuProps {
  /** Accessible name of the menu: "Status", "Labels". */
  'aria-label': string;
  /** One flat list... */
  items?: readonly PickerMenuItem[];
  /** ...or sections, drawn with headers and separators. */
  sections?: readonly PickerMenuSection[];
  /**
   * `single` (default): a check on the current value; Enter or a click picks it and closes.
   * `multiple`: a checkbox per item; Enter toggles and the menu stays open (labels).
   * `none`: plain actions, no checks (blockers, subtasks).
   */
  selectionMode?: 'single' | 'multiple' | 'none';
  /** Checked item ids. */
  selectedKeys?: Iterable<string>;
  /** An item was picked (single, none) or toggled (multiple, after onSelectionChange). */
  onAction?: (id: string) => void;
  /** `multiple`: the new set of checked ids. */
  onSelectionChange?: (ids: Set<string>) => void;
  /** `removable` items: Backspace on the highlighted item with an empty search, or a click on its ×. */
  onRemove?: (id: string) => void;
  /** Offer "Create …" for typed text that matches no item exactly. */
  create?: PickerMenuCreate;
  /**
   * Search field at the top. `filter: false` keeps every item (the due-date picker reads the text as a date).
   * `false` drops the field; the menu takes focus instead.
   */
  search?:
    | false
    | {
        placeholder: string;
        /** The key that opened the picker, shown at the right: "S", "⇧D". */
        kbd?: string;
        filter?: boolean;
      };
  /** Controlled search text. */
  query?: string;
  onQueryChange?: (query: string) => void;
  /** Digits pick the item with that `numberKey` while the search is empty (status 1–6, priority 0–4). */
  numberKeys?: boolean;
  /** Shown when the search matches nothing and there is no create item. */
  emptyText?: ReactNode;
  /** Content between the search field and the list (a context line). */
  before?: ReactNode;
  /** Content after the list, before the footer: swatches, a calendar, MenuNote, MenuTip, MenuRowButton. */
  children?: ReactNode;
  /** Footer key hints ("↵ toggle", "Esc done") and right-hand text ("4 selected"). */
  footer?: { hints?: readonly MenuFooterHint[]; end?: ReactNode };
  /** Called when a pick should close the menu, and on Escape with an empty search. */
  onClose?: () => void;
  /** Focus the search field (or the menu) on mount. Default true. */
  autoFocus?: boolean;
  /** Width in px; omit inside a popover that sets it. */
  width?: number;
  /** Max height of the scrolling list in px (default 320). */
  maxListHeight?: number;
  className?: string;
}

const CREATE_KEY = '__create__';

/** The .menu-sep rule above every section but the first, drawn as a border so it stays out of the collection. */
const sectionRule = '-mx-1.5 mt-1.25 border-t border-line-soft px-1.5 pt-1.25';

/** The text the search matches and screen readers use for typeahead: textValue, or key plus label. */
function searchText(item: PickerMenuItem): string {
  return item.textValue ?? (item.taskKey ? `${item.taskKey} ${item.label}` : item.label);
}

/** Splits `text` around the first case-insensitive match of `query` for the search highlight (.hl). */
export function highlightMatch(text: string, query: string): ReactNode {
  const needle = query.trim();
  if (!needle) return text;
  const index = text.toLocaleLowerCase().indexOf(needle.toLocaleLowerCase());
  if (index < 0) return text;
  return (
    <>
      {text.slice(0, index)}
      {/* .hl: a 28% tint of the in-progress amber. 3px radius has no token. */}
      <mark className="rounded-[3px] bg-status-prog/28 text-current">
        {text.slice(index, index + needle.length)}
      </mark>
      {text.slice(index + needle.length)}
    </>
  );
}

/**
 * The panel of a picker: search, sections, items, notes and footer. See the file comment. Safe anywhere,
 * also between a Tabs list and its panel (it waits until it is in the page, see useInDocument).
 */
export function PickerMenu(props: PickerMenuProps) {
  const [probe, inDocument] = useInDocument();
  if (!inDocument) return <span ref={probe} hidden />;
  return <PickerMenuPanel {...props} />;
}

function PickerMenuPanel({
  items,
  sections,
  selectionMode = 'single',
  selectedKeys,
  onAction,
  onSelectionChange,
  onRemove,
  create,
  search = { placeholder: 'Search…' },
  query: controlledQuery,
  onQueryChange,
  numberKeys = false,
  emptyText = 'No matches',
  before,
  children,
  footer,
  onClose,
  autoFocus = true,
  width,
  maxListHeight = 320,
  className,
  ...props
}: PickerMenuProps) {
  const { contains } = useFilter({ sensitivity: 'base' });
  const [innerQuery, setInnerQuery] = useState('');
  const query = controlledQuery ?? innerQuery;
  const setQuery = (next: string) => {
    if (controlledQuery === undefined) setInnerQuery(next);
    onQueryChange?.(next);
  };
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const allSections: PickerMenuSection[] = useMemo(
    () => (sections ? [...sections] : [{ id: 'items', items: items ?? [] }]),
    [sections, items],
  );
  const byId = useMemo(() => {
    const map = new Map<string, PickerMenuItem>();
    for (const section of allSections) for (const item of section.items) map.set(item.id, item);
    return map;
  }, [allSections]);

  const filtering = search !== false && search.filter !== false;
  const trimmed = query.trim();
  const matches = (item: PickerMenuItem) => !filtering || !trimmed || contains(searchText(item), trimmed);
  const anyMatch = [...byId.values()].some(matches);
  const exact = [...byId.values()].some(
    (item) => item.label.toLocaleLowerCase() === trimmed.toLocaleLowerCase(),
  );
  const showCreate = Boolean(create && trimmed && !exact);

  const checked = useMemo(() => new Set(selectedKeys ?? []), [selectedKeys]);

  const pick = useCallback(
    (id: string) => {
      if (id === CREATE_KEY) {
        create?.onCreate(trimmed);
        return;
      }
      const item = byId.get(id);
      if (!item || item.refusal || item.isDisabled) return;
      if (selectionMode === 'multiple') {
        const next = new Set(checked);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        onSelectionChange?.(next);
        onAction?.(id);
        return;
      }
      onAction?.(id);
      onClose?.();
    },
    [byId, checked, create, onAction, onClose, onSelectionChange, selectionMode, trimmed],
  );

  /** The highlighted item: React Aria marks it data-focused (virtual focus from the search field). */
  const focusedId = (): string | null => {
    const node = menuRef.current?.querySelector<HTMLElement>('[role^="menuitem"][data-focused]');
    return node?.dataset.key ?? null;
  };

  const onKeyDownCapture = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (numberKeys && /^[0-9]$/.test(event.key) && !event.metaKey && !event.ctrlKey && !event.altKey) {
      if (query === '') {
        const target = [...byId.values()].find((item) => item.numberKey === event.key);
        if (target) {
          event.preventDefault();
          event.stopPropagation();
          pick(target.id);
        }
      }
      return;
    }
    if (create?.trigger === 'mod-enter' && event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      if (trimmed) {
        event.preventDefault();
        event.stopPropagation();
        create.onCreate(trimmed);
      }
      return;
    }
    if (event.key === 'Backspace' && query === '' && onRemove) {
      const id = focusedId();
      if (id && byId.get(id)?.removable) {
        event.preventDefault();
        event.stopPropagation();
        onRemove(id);
      }
    }
  };

  const menuSelection: Selection = selectionMode === 'none' ? new Set<Key>() : new Set<Key>(checked);

  const menu = (
    <AriaMenu
      ref={menuRef}
      aria-label={props['aria-label']}
      autoFocus={search === false && autoFocus ? 'first' : undefined}
      selectionMode={selectionMode === 'none' ? undefined : selectionMode}
      selectedKeys={menuSelection}
      // Selection is drawn from `selectedKeys`; changes go through onAction so refused items stay unchanged.
      onSelectionChange={() => {}}
      onAction={(key) => pick(String(key))}
      renderEmptyState={() =>
        showCreate ? null : <div className="px-2 py-1.5 text-sm text-fg-3">{emptyText}</div>
      }
      className="flex flex-col gap-px overflow-auto p-1.5 outline-none"
      style={{ maxHeight: maxListHeight }}
    >
      {allSections.map((section, index) => {
        const sectionMatches = (item: PickerMenuItem) => section.filter === false || matches(item);
        const visible = section.items.filter(sectionMatches);
        if (visible.length === 0) return null;
        const first =
          allSections.findIndex((other) =>
            other.items.some((item) => other.filter === false || matches(item)),
          ) === index;
        return (
          <PickerSection
            key={section.id}
            id={section.id}
            title={section.title}
            separated={!first}
            items={visible}
            query={filtering && section.filter !== false ? trimmed : ''}
            selectionMode={selectionMode}
            checked={checked}
            numberKeys={numberKeys}
            onRemove={onRemove}
          />
        );
      })}
      {showCreate && create ? (
        <AriaMenuSection id="create" className={cn('flex flex-col gap-px', anyMatch && sectionRule)}>
          {!anyMatch && create.emptyTitle ? (
            <Header className="px-2 pt-1.5 pb-1 text-xs font-medium text-fg-3">
              {create.emptyTitle(trimmed)}
            </Header>
          ) : null}
          <AriaMenuItem
            id={CREATE_KEY}
            textValue={create.label(trimmed)}
            className={itemClass('default', 'font-medium text-accent-text')}
          >
            <PlusGlyph />
            <span className="min-w-0 flex-1 truncate">{create.label(trimmed)}</span>
            <Kbd aria-hidden>{create.trigger === 'mod-enter' ? '⌘↵' : '↵'}</Kbd>
          </AriaMenuItem>
        </AriaMenuSection>
      ) : null}
    </AriaMenu>
  );

  return (
    <div
      onKeyDownCapture={onKeyDownCapture}
      className={cn('flex flex-col text-sm text-fg', className)}
      style={width ? { width } : undefined}
    >
      {search === false ? (
        <>
          {before}
          {menu}
        </>
      ) : (
        <Autocomplete
          inputValue={query}
          onInputChange={setQuery}
          // Filtering happens above (sections and the create item need the same rule), so none here.
        >
          <SearchField
            aria-label={search.placeholder.replace(/…$/, '')}
            autoFocus={autoFocus}
            onKeyDown={(event) => {
              // The search field eats Escape: the first one clears the text, the next one closes.
              if (event.key === 'Escape' && (event.target as HTMLInputElement).value === '') onClose?.();
            }}
            className="flex h-9 shrink-0 items-center gap-2 border-b border-line-soft px-3"
          >
            <Input
              ref={inputRef}
              placeholder={search.placeholder}
              className="min-w-0 flex-1 border-0 bg-transparent p-0 text-md text-fg caret-accent outline-none placeholder:text-fg-3 [&::-webkit-search-cancel-button]:hidden"
            />
            {search.kbd ? <Kbd aria-hidden>{search.kbd}</Kbd> : null}
          </SearchField>
          {before}
          {menu}
        </Autocomplete>
      )}
      {children ? <div className="flex flex-col px-1.5 pb-1.5">{children}</div> : null}
      {footer ? <MenuFooter hints={footer.hints} end={footer.end} /> : null}
    </div>
  );
}

function itemClass(tone: PickerMenuItem['tone'], extra?: string) {
  return cn(
    'flex min-h-8 cursor-default flex-wrap items-center gap-x-2.25 rounded-sm px-2 whitespace-nowrap outline-none select-none',
    'focus:bg-bg-lane disabled:text-fg-3',
    tone === 'dim' || tone === 'gone' ? 'text-fg-3' : 'text-fg',
    extra,
  );
}

interface PickerSectionProps {
  id: string;
  title?: ReactNode;
  separated: boolean;
  items: readonly PickerMenuItem[];
  query: string;
  selectionMode: 'single' | 'multiple' | 'none';
  checked: Set<string>;
  numberKeys: boolean;
  onRemove?: (id: string) => void;
}

function PickerSection({
  id,
  title,
  separated,
  items,
  query,
  selectionMode,
  checked,
  numberKeys,
  onRemove,
}: PickerSectionProps) {
  return (
    <AriaMenuSection id={id} className={cn('flex flex-col gap-px', separated && sectionRule)}>
      {title ? <Header className="px-2 pt-1.5 pb-1 text-xs font-medium text-fg-3">{title}</Header> : null}
      {items.map((item) => (
        <AriaMenuItem
          key={item.id}
          id={item.id}
          textValue={searchText(item)}
          isDisabled={item.isDisabled}
          shouldCloseOnSelect={item.refusal || selectionMode === 'multiple' ? false : undefined}
          className={itemClass(item.tone)}
        >
          {({ isSelected }) => {
            const on = selectionMode !== 'none' && (isSelected || checked.has(item.id));
            return (
              <>
                {/* One line that never wraps (long titles truncate); a refusal goes under it. */}
                <span className="flex min-h-8 min-w-0 basis-full items-center gap-x-2.25">
                  {selectionMode === 'multiple' ? <CheckboxBox checked={on} /> : null}
                  {item.lead ? (
                    <span className="flex w-3.5 shrink-0 items-center justify-center">{item.lead}</span>
                  ) : null}
                  {item.taskKey ? (
                    <span className="w-14.5 shrink-0 text-xs font-medium text-fg-3 tabular-nums">
                      {item.taskKey}
                    </span>
                  ) : null}
                  <span
                    className={cn(
                      'min-w-0 truncate',
                      item.tone === 'done' && 'text-fg-3 line-through decoration-line',
                      item.tone === 'gone' && 'italic',
                    )}
                  >
                    {highlightMatch(item.label, query)}
                  </span>
                  {item.sub ? <span className="shrink-0 text-xs text-fg-3">{item.sub}</span> : null}
                  <span className="flex-1" />
                  {item.meta != null ? (
                    <span className="shrink-0 text-xs text-fg-3 tabular-nums">{item.meta}</span>
                  ) : null}
                  {item.trailing}
                  {selectionMode === 'single' && on ? (
                    <span className="grid w-3.5 shrink-0 place-items-center text-accent-text">
                      <CheckGlyph />
                    </span>
                  ) : numberKeys && item.numberKey ? (
                    <Kbd aria-hidden>{item.numberKey}</Kbd>
                  ) : null}
                  {item.removable && onRemove ? (
                    // Pointer shortcut for the × only; keyboard users press Backspace (footer hint).
                    <span
                      aria-hidden
                      data-remove
                      onPointerDown={(event) => event.stopPropagation()}
                      onPointerUp={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        onRemove(item.id);
                      }}
                      className="grid size-4 shrink-0 cursor-pointer place-items-center rounded-sm text-fg-3 hover:bg-line-soft hover:text-fg"
                    >
                      <CloseGlyph />
                    </span>
                  ) : null}
                </span>
                {item.refusal ? (
                  <Text
                    slot="description"
                    className="mt-1 mb-0.5 basis-full rounded-sm bg-danger-soft px-2.5 py-2.25 text-sm leading-normal whitespace-normal text-danger"
                  >
                    {item.refusal}
                  </Text>
                ) : null}
              </>
            );
          }}
        </AriaMenuItem>
      ))}
    </AriaMenuSection>
  );
}

/** Danger note inside a menu, outside the list: a refusal that isn't about one item. */
export function MenuNote({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      role="note"
      className={cn(
        'mx-0.5 mt-1 mb-0.5 flex gap-2 rounded-sm bg-danger-soft px-2.5 py-2.25 text-sm leading-normal text-danger',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Info tip inside a menu: "Labels named “billing” in other projects show as one label in workspace filters." */
export function MenuTip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      role="note"
      className={cn(
        'mx-0.5 mt-1 mb-0.5 rounded-sm bg-bg-lane px-2.5 py-2 text-xs leading-normal text-fg-2',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Footer row of a menu: key hints on the left, a note on the right ("4 selected", "Only tasks in Payments"). */
export function MenuFooter({
  hints = [],
  end,
  className,
}: {
  hints?: readonly MenuFooterHint[];
  end?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-center gap-3 border-t border-line-soft px-3 py-2 text-xs text-fg-3',
        className,
      )}
    >
      {hints.map((hint) => (
        <KeyHint key={hint.label} keys={hint.keys}>
          {hint.label}
        </KeyHint>
      ))}
      <span className="flex-1" />
      {end}
    </div>
  );
}

export interface MenuRowButtonProps extends Omit<AriaButtonProps, 'children'> {
  children: ReactNode;
  /** Right-hand content: a × for Clear due date, a key hint. */
  trailing?: ReactNode;
}

/** A menu-row-shaped button for actions outside the list: "Clear due date". */
export function MenuRowButton({ children, trailing, className, ...props }: MenuRowButtonProps) {
  return (
    <AriaButton
      {...props}
      className={cn(
        'flex min-h-8 w-full cursor-pointer items-center gap-2.25 rounded-sm px-2 text-left text-sm text-fg outline-none',
        'hover:bg-bg-lane focus-visible:bg-bg-lane disabled:cursor-default disabled:text-fg-3',
        typeof className === 'string' ? className : undefined,
      )}
    >
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {trailing}
    </AriaButton>
  );
}

/** A thin rule between content blocks inside a menu (outside the list). */
export function MenuDivider() {
  return <hr className="-mx-1.5 my-1.25 h-px border-0 bg-line-soft" />;
}

export interface PickerMenuPopoverProps extends Omit<PickerMenuProps, 'onClose' | 'width'> {
  /** The trigger: a Button or another React Aria pressable. */
  trigger: ReactNode;
  /** Controlled open state, for opening from a shortcut (S, P, Shift+D). */
  isOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  /** Anchor element when it differs from the trigger (a property row). */
  triggerRef?: RefObject<Element | null>;
  placement?: PopoverProps['placement'];
  /** Popover width in px (default 280). */
  width?: number;
}

/**
 * A PickerMenu in a popover under its trigger. Single picks close it; multiple toggles keep it open; Escape
 * clears the search, then closes. Focus returns to the trigger.
 */
export function PickerMenuPopover({
  trigger,
  isOpen,
  onOpenChange,
  triggerRef,
  placement = 'bottom start',
  width = 280,
  ...menuProps
}: PickerMenuPopoverProps) {
  const [innerOpen, setInnerOpen] = useState(false);
  const open = isOpen ?? innerOpen;
  const setOpen = (next: boolean) => {
    if (isOpen === undefined) setInnerOpen(next);
    onOpenChange?.(next);
  };
  return (
    <MenuTrigger isOpen={open} onOpenChange={setOpen} trigger="press">
      {trigger}
      <Popover
        placement={placement}
        triggerRef={triggerRef}
        className="min-w-0 overflow-hidden"
        style={{ width }}
      >
        <PickerMenu {...menuProps} onClose={() => setOpen(false)} />
      </Popover>
    </MenuTrigger>
  );
}
