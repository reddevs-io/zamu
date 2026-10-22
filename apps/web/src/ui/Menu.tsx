import type { ReactNode } from 'react';
import {
  Menu as AriaMenu,
  MenuItem as AriaMenuItem,
  type MenuItemProps as AriaMenuItemProps,
  type MenuProps,
  type PopoverProps,
  Separator,
} from 'react-aria-components';
import { cn, composeTw } from './cn';
import { Popover } from './ListBox';

export { MenuTrigger, SubmenuTrigger } from 'react-aria-components';

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
      <AriaMenu {...props} className={composeTw(className, 'max-h-80 overflow-auto py-1 outline-none')} />
    </Popover>
  );
}

export interface MenuItemProps extends Omit<AriaMenuItemProps, 'children'> {
  children: ReactNode;
  /** Danger text for destructive items (Remove, Revoke). */
  tone?: 'default' | 'danger';
  /** Shortcut hint shown on the right. */
  kbd?: string;
}

export function MenuItem({ children, tone = 'default', kbd, ...props }: MenuItemProps) {
  const textValue = props.textValue ?? (typeof children === 'string' ? children : undefined);
  return (
    <AriaMenuItem
      {...props}
      textValue={textValue}
      className={composeTw(props.className, () =>
        cn(
          'flex h-8 cursor-default items-center gap-2 px-3 outline-none select-none focus:bg-sel disabled:opacity-50',
          tone === 'danger' ? 'text-danger' : 'text-fg',
        ),
      )}
    >
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {kbd ? <span className="font-mono text-[9.5px] text-faint">{kbd}</span> : null}
    </AriaMenuItem>
  );
}

export function MenuSeparator() {
  return <Separator className="my-1 h-px border-0 bg-line-2" />;
}
