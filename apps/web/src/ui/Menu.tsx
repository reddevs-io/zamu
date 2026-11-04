import type { ReactNode } from 'react';
import {
  Menu as AriaMenu,
  MenuItem as AriaMenuItem,
  type MenuItemProps as AriaMenuItemProps,
  MenuSection as AriaMenuSection,
  Header,
  type MenuProps,
  type MenuSectionProps,
  type PopoverProps,
  Separator,
} from 'react-aria-components';
import { cn, composeTw } from './cn';
import { Kbd } from './Kbd';
import { Popover } from './ListBox';

export { MenuTrigger, SubmenuTrigger } from 'react-aria-components';

/*
 * Action menus (workspace menu, person menu, row "more" menus). Pickers with a search field, checks and
 * number keys use PickerMenu instead. Same Margin look: margin.css .menu, .menu-i, .menu-sep, .menu-h.
 */

export interface MenuPopoverProps<T> extends MenuProps<T> {
  placement?: PopoverProps['placement'];
}

/** Menu inside its popover. Use within MenuTrigger after the trigger Button. */
export function Menu<T extends object>({
  placement = 'bottom end',
  className,
  ...props
}: MenuPopoverProps<T>) {
  return (
    <Popover placement={placement} className="min-w-44">
      <AriaMenu
        {...props}
        className={composeTw(className, 'flex max-h-80 flex-col gap-px overflow-auto p-1.5 outline-none')}
      />
    </Popover>
  );
}

export interface MenuItemProps extends Omit<AriaMenuItemProps, 'children'> {
  children: ReactNode;
  /** Danger text for destructive items (Remove, Revoke). */
  tone?: 'default' | 'danger';
  /** Shortcut hint shown on the right. */
  kbd?: string;
  /** Glyph before the label. */
  lead?: ReactNode;
}

export function MenuItem({ children, tone = 'default', kbd, lead, ...props }: MenuItemProps) {
  const textValue = props.textValue ?? (typeof children === 'string' ? children : undefined);
  return (
    <AriaMenuItem
      {...props}
      textValue={textValue}
      className={composeTw(props.className, () =>
        cn(
          'flex min-h-8 cursor-default items-center gap-2.25 rounded-sm px-2 whitespace-nowrap outline-none select-none',
          'focus:bg-bg-lane disabled:text-fg-3',
          tone === 'danger' ? 'text-danger' : 'text-fg',
        ),
      )}
    >
      {lead ? <span className="flex w-4 shrink-0 items-center justify-center">{lead}</span> : null}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {kbd ? <Kbd aria-hidden>{kbd}</Kbd> : null}
    </AriaMenuItem>
  );
}

export function MenuSeparator() {
  return <Separator className="-mx-1.5 my-1.25 h-px border-0 bg-line-soft" />;
}

export interface MenuGroupProps<T> extends Omit<MenuSectionProps<T>, 'children'> {
  /** Section header: "Workspaces", "Theme". */
  title?: ReactNode;
  children: ReactNode;
}

/** A titled group of items inside a Menu. */
export function MenuGroup<T extends object>({ title, children, className, ...props }: MenuGroupProps<T>) {
  return (
    <AriaMenuSection {...props} className={cn('flex flex-col gap-px', className)}>
      {title ? <Header className="px-2 pt-1.5 pb-1 text-xs font-medium text-fg-3">{title}</Header> : null}
      {children}
    </AriaMenuSection>
  );
}
