import type { ReactNode } from 'react';
import {
  Button as AriaButton,
  Select as AriaSelect,
  type SelectProps as AriaSelectProps,
  SelectValue,
} from 'react-aria-components';
import { cn, composeTw } from './cn';
import { type FieldChromeProps, FieldDescription, FieldError, fieldStack, inputBase, Label } from './Field';
import { ListBox, type OptionItem, OptionLead, OptionRow, Popover } from './ListBox';

type SelectionMode = 'single' | 'multiple';

export interface SelectProps<M extends SelectionMode = 'single'>
  extends Omit<AriaSelectProps<OptionItem, M>, 'children' | 'items'>,
    FieldChromeProps {
  items: readonly OptionItem[];
  /**
   * `field`: 38px input look with label (forms).
   * `chip`: 28px bordered chip (quick create).
   * `filter`: "Status Any" text trigger for the FilterBar; `label` is the prefix.
   * `cell`: 28px full-width trigger inside a table row (Backlog.md mappings); pair it with `aria-label`.
   */
  variant?: 'field' | 'chip' | 'filter' | 'cell';
  /** `cell` only: `warn` draws the --warn border on --warn-bg (a fallback value). */
  tone?: 'default' | 'warn';
  /** `cell` only: note before the ▾, for example "by name" or "fallback". */
  trailing?: ReactNode;
  /** `cell` only: classes for the trigger button (MappingRow forces the focus look with them). */
  triggerClassName?: string;
  /** Shown when nothing is selected. Filters default to "Any". */
  placeholder?: string;
  /** Custom trigger content for the chip variant (receives the selected items). */
  renderValue?: (selected: OptionItem[]) => ReactNode;
}

function Summary({ selected, placeholder }: { selected: OptionItem[]; placeholder: string }) {
  const [first] = selected;
  if (!first) return <span className="truncate text-faint">{placeholder}</span>;
  if (selected.length > 1) {
    return <span className="truncate">{selected.map((item) => item.label).join(', ')}</span>;
  }
  return (
    <>
      <OptionLead item={first} />
      <span className="truncate">{first.label}</span>
    </>
  );
}

export function Select<M extends SelectionMode = 'single'>({
  label,
  description,
  errorMessage,
  items,
  variant = 'field',
  placeholder,
  renderValue,
  tone = 'default',
  trailing,
  triggerClassName,
  ...props
}: SelectProps<M>) {
  const fallback = placeholder ?? (variant === 'filter' ? 'Any' : 'Select');
  const ariaLabel = props['aria-label'] ?? (typeof label === 'string' ? label : undefined);

  const value = (
    <SelectValue<OptionItem> className="flex min-w-0 items-center gap-1.5">
      {({ state }) => {
        // Look items up by key: node values are not always populated for wrapped item components.
        const keys = state.selectionManager.selectedKeys;
        const selected = items.filter((item) => keys.has(item.id));
        if (renderValue) return renderValue(selected);
        if (variant === 'filter') {
          return (
            <span className="truncate font-medium text-fg">
              {selected.length ? selected.map((item) => item.label).join(', ') : fallback}
            </span>
          );
        }
        return <Summary selected={selected} placeholder={fallback} />;
      }}
    </SelectValue>
  );

  const popover = (
    <Popover>
      <ListBox items={items}>{(item) => <OptionRow item={item} />}</ListBox>
    </Popover>
  );

  if (variant === 'filter') {
    return (
      <AriaSelect<OptionItem, M>
        aria-label={ariaLabel}
        {...props}
        className={composeTw(props.className, 'inline-flex')}
      >
        <AriaButton className="inline-flex h-7 max-w-64 cursor-pointer items-center gap-1 text-[12px] whitespace-nowrap text-muted outline-none hover:text-fg focus-visible:focus-ring">
          <span>{label}</span>
          {value}
        </AriaButton>
        {popover}
      </AriaSelect>
    );
  }

  if (variant === 'cell') {
    return (
      <AriaSelect<OptionItem, M>
        aria-label={ariaLabel}
        {...props}
        className={composeTw(props.className, 'flex min-w-0')}
      >
        <AriaButton
          data-tone={tone}
          className={cn(
            'box-border flex h-7 w-full min-w-0 cursor-pointer items-center gap-[7px] overflow-hidden border px-2 text-left text-[12.5px] whitespace-nowrap text-fg outline-none',
            tone === 'warn' ? 'border-warn bg-warn-bg' : 'border-line bg-surface hover:border-muted',
            'focus-visible:halo pressed:halo aria-expanded:halo',
            triggerClassName,
          )}
        >
          <span className="flex min-w-0 flex-1 items-center gap-[7px]">{value}</span>
          {trailing}
          <span aria-hidden className="text-[10px] text-faint">
            ▾
          </span>
        </AriaButton>
        {popover}
      </AriaSelect>
    );
  }

  if (variant === 'chip') {
    return (
      <AriaSelect<OptionItem, M>
        aria-label={ariaLabel}
        {...props}
        className={composeTw(props.className, 'inline-flex')}
      >
        <AriaButton className="inline-flex h-7 max-w-64 cursor-pointer items-center gap-[7px] border border-line bg-surface px-2.5 text-[12.5px] whitespace-nowrap text-fg outline-none hover:bg-band focus-visible:focus-ring">
          {value}
        </AriaButton>
        {popover}
      </AriaSelect>
    );
  }

  return (
    <AriaSelect<OptionItem, M> {...props} className={composeTw(props.className, fieldStack)}>
      {({ isInvalid }) => (
        <>
          {label ? <Label>{label}</Label> : null}
          <AriaButton
            className={cn(
              inputBase,
              'flex h-[38px] cursor-pointer items-center gap-2 text-left pressed:halo focus-visible:halo',
            )}
          >
            <span className="flex min-w-0 flex-1 items-center gap-2">{value}</span>
            <span aria-hidden className="text-[10px] text-faint">
              ▾
            </span>
          </AriaButton>
          {description && !isInvalid ? <FieldDescription>{description}</FieldDescription> : null}
          <FieldError>{errorMessage as ReactNode}</FieldError>
          {popover}
        </>
      )}
    </AriaSelect>
  );
}
