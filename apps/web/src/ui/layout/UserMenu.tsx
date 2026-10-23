import { Fragment, useState } from 'react';
import {
  Button as AriaButton,
  Menu as AriaMenu,
  Dialog,
  DialogTrigger,
  type PopoverProps,
  SubmenuTrigger,
} from 'react-aria-components';
import { Avatar } from '../Avatar';
import { cn } from '../cn';
import { Popover } from '../ListBox';
import { Menu, MenuItem, MenuSeparator } from '../Menu';
import { SegmentedControl, type SegmentedItem } from '../SegmentedControl';

export type ThemeChoice = 'light' | 'dark' | 'system';

export const THEME_CHOICES: readonly SegmentedItem<ThemeChoice>[] = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'system', label: 'System' },
];

export interface UserMenuSubItem {
  id: string;
  label: string;
  onAction?: () => void;
  href?: string;
  /** Check mark: the current workspace. */
  isCurrent?: boolean;
}

export interface UserMenuItem {
  id: string;
  label: string;
  onAction?: () => void;
  /** Link target (Appearance). */
  href?: string;
  tone?: 'default' | 'danger';
  /** Opens a submenu with these items (Switch workspace). */
  submenu?: readonly UserMenuSubItem[];
}

export interface UserMenuProps {
  user: { name: string; hue?: number; initials?: string };
  /** Line under the name: "Admin · Reddevs". */
  subtitle?: string;
  /** Current theme. The Theme switch shows when `onThemeChange` is set. */
  theme?: ThemeChoice;
  onThemeChange?: (theme: ThemeChoice) => void;
  /** Menu items in groups; groups are separated by a line. */
  groups: readonly (readonly UserMenuItem[])[];
  placement?: PopoverProps['placement'];
  className?: string;
}

/**
 * Account menu on the rail avatar: name and subtitle, the Light/Dark/System switch, then menu groups
 * (Appearance, Switch workspace ›, Sign out). A popover dialog holding a header, the switch and a Menu.
 */
export function UserMenu({
  user,
  subtitle,
  theme = 'system',
  onThemeChange,
  groups,
  placement = 'right bottom',
  className,
}: UserMenuProps) {
  const [isOpen, setOpen] = useState(false);
  const items = groups.flat();
  const run = (id: string) => {
    const item = items.find((entry) => entry.id === id);
    if (!item || item.submenu) return;
    setOpen(false);
    item.onAction?.();
  };
  return (
    <DialogTrigger isOpen={isOpen} onOpenChange={setOpen}>
      <AriaButton
        aria-label={`${user.name}: account menu`}
        className={cn('cursor-pointer rounded-full outline-none focus-visible:focus-ring', className)}
      >
        <Avatar name={user.name} hue={user.hue} initials={user.initials} size="md" decorative />
      </AriaButton>
      <Popover placement={placement} offset={8} className="w-[280px] min-w-0 overflow-visible">
        <Dialog aria-label="Account" className="flex flex-col outline-none">
          <div className="flex items-center gap-2.5 border-b border-line-2 px-3 py-3">
            <Avatar name={user.name} hue={user.hue} initials={user.initials} size="md" decorative />
            <div className="flex min-w-0 flex-col">
              <span className="truncate font-semibold">{user.name}</span>
              {subtitle ? <span className="truncate text-[11.5px] text-muted">{subtitle}</span> : null}
            </div>
          </div>
          {onThemeChange ? (
            <div className="flex flex-col gap-2 border-b border-line-2 px-3 pt-2.5 pb-3">
              <span className="caps">Theme</span>
              <SegmentedControl
                aria-label="Theme"
                items={THEME_CHOICES}
                value={theme}
                onChange={onThemeChange}
                fullWidth
                className="h-7"
              />
            </div>
          ) : null}
          <AriaMenu
            aria-label="Account actions"
            onAction={(key) => run(String(key))}
            className="py-1 outline-none"
          >
            {groups.map((group, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: groups are static and ordered.
              <Fragment key={index}>
                {index > 0 ? <MenuSeparator /> : null}
                {group.map((item) =>
                  item.submenu ? (
                    <SubmenuTrigger key={item.id}>
                      <MenuItem id={item.id} textValue={item.label}>
                        <span className="flex items-center">
                          <span className="flex-1">{item.label}</span>
                          <span aria-hidden className="text-faint">
                            ›
                          </span>
                        </span>
                      </MenuItem>
                      <Menu
                        placement="end top"
                        onAction={(key) => {
                          const sub = item.submenu?.find((entry) => entry.id === key);
                          setOpen(false);
                          sub?.onAction?.();
                        }}
                      >
                        {item.submenu.map((sub) => (
                          <MenuItem key={sub.id} id={sub.id} href={sub.href} textValue={sub.label}>
                            <span className="flex items-center gap-2">
                              <span className="flex-1 truncate">{sub.label}</span>
                              {sub.isCurrent ? (
                                <span aria-hidden className="text-accent">
                                  ✓
                                </span>
                              ) : null}
                            </span>
                          </MenuItem>
                        ))}
                      </Menu>
                    </SubmenuTrigger>
                  ) : (
                    <MenuItem
                      key={item.id}
                      id={item.id}
                      href={item.href}
                      tone={item.tone}
                      textValue={item.label}
                    >
                      {item.label}
                    </MenuItem>
                  ),
                )}
              </Fragment>
            ))}
          </AriaMenu>
        </Dialog>
      </Popover>
    </DialogTrigger>
  );
}
