import type { ReactNode } from 'react';
import {
  ListBox as AriaListBox,
  ListBoxItem as AriaListBoxItem,
  Popover as AriaPopover,
  type Key,
  type ListBoxItemProps,
  type ListBoxProps,
  type PopoverProps,
} from 'react-aria-components';
import { Avatar, type MemberKind } from './Avatar';
import { cn, composeTw } from './cn';

/** One option in Select, ComboBox and filter menus. */
export interface OptionItem {
  id: Key;
  label: string;
  description?: string;
  /** Person or agent avatar drawn before the label. */
  avatar?: { name: string; kind: MemberKind; hue?: number; initials?: string };
  /** Any other leading marker: StatusSquare, PriorityGlyph, a mono project key. */
  prefix?: ReactNode;
  isDisabled?: boolean;
}

export function Popover({ className, ...props }: PopoverProps) {
  return (
    <AriaPopover
      offset={4}
      {...props}
      className={composeTw(
        className,
        'min-w-(--trigger-width) overflow-auto border border-line bg-surface text-fg shadow-dialog outline-none',
      )}
    />
  );
}

export function ListBox<T extends object>({ className, ...props }: ListBoxProps<T>) {
  return (
    <AriaListBox {...props} className={composeTw(className, 'max-h-72 overflow-auto py-1 outline-none')} />
  );
}

export function OptionLead({ item }: { item: OptionItem }) {
  if (item.avatar) return <Avatar {...item.avatar} size="sm" decorative />;
  return item.prefix ? <span className="flex shrink-0 items-center">{item.prefix}</span> : null;
}

export function ListBoxItem({ className, ...props }: ListBoxItemProps) {
  return (
    <AriaListBoxItem
      {...props}
      className={composeTw(
        className,
        'flex min-h-8 cursor-default items-center gap-2 px-3 py-1 text-fg outline-none select-none focus:bg-sel disabled:opacity-50',
      )}
    />
  );
}

/** Renders an OptionItem: lead marker, label, optional description, and a check when selected. */
export function OptionRow({ item }: { item: OptionItem }) {
  return (
    <ListBoxItem id={item.id} textValue={item.label} isDisabled={item.isDisabled}>
      {({ isSelected }) => (
        <>
          <OptionLead item={item} />
          <span className="min-w-0 flex-1">
            <span className={cn('block truncate', isSelected && 'font-semibold')}>{item.label}</span>
            {item.description ? (
              <span className="block truncate text-[11.5px] text-muted">{item.description}</span>
            ) : null}
          </span>
          <span
            aria-hidden
            className={cn('w-3 shrink-0 text-center text-accent', !isSelected && 'invisible')}
          >
            ✓
          </span>
        </>
      )}
    </ListBoxItem>
  );
}
