import type { ReactNode } from 'react';
import { Button as AriaButton, Link, MenuTrigger } from 'react-aria-components';
import { Avatar } from '../Avatar';
import { cn } from '../cn';
import { Menu, MenuItem } from '../Menu';
import { Tooltip, TooltipTrigger } from '../Tooltip';
import { UserMenu, type UserMenuProps } from './UserMenu';

export interface RailNavItem {
  id: string;
  label: string;
  href: string;
  isCurrent?: boolean;
}

export interface RailProject {
  key: string;
  /** Full name, shown in a tooltip. */
  name: string;
  openCount: number;
  href: string;
  isCurrent?: boolean;
  /** Tasks come from a Backlog.md mirror: a small square at the top right and a note in the tooltip. */
  mirrored?: boolean;
}

export interface RailUserAction {
  id: string;
  label: string;
  onAction: () => void;
  tone?: 'default' | 'danger';
}

export interface RailProps {
  workspace: { name: string; initial?: string; href?: string };
  /** Top links (M1: Projects). */
  nav?: readonly RailNavItem[];
  projects?: readonly RailProject[];
  settings?: { href: string; isCurrent?: boolean; label?: string };
  user: { name: string; hue?: number; initials?: string };
  /** Items of the simple avatar menu, for example Sign out. Ignored when `userMenu` is set. */
  userActions?: readonly RailUserAction[];
  /** Full account menu (name, theme switch, groups). Replaces `userActions`. */
  userMenu?: Omit<UserMenuProps, 'user' | 'className'>;
  className?: string;
}

const navLink = (current: boolean | undefined) =>
  cn(
    'grid h-[38px] place-items-center text-[10.5px] outline-none focus-visible:focus-ring-inset',
    current ? 'bg-rail-on font-semibold text-rail' : 'font-medium text-rail-fg hover:text-rail-on',
  );

/** Dark project rail: workspace mark, nav, project keys with open counts, settings and the avatar menu. */
export function Rail({
  workspace,
  nav = [],
  projects = [],
  settings,
  user,
  userActions = [],
  userMenu,
  className,
}: RailProps) {
  const initial = workspace.initial ?? workspace.name.charAt(0).toUpperCase();
  const mark = (
    <span className="mx-auto mb-2.5 grid size-8 place-items-center bg-accent text-[14px] font-bold text-[oklch(0.99_0_0)]">
      {initial}
    </span>
  );
  return (
    <nav
      aria-label="Main"
      className={cn('flex min-h-0 flex-col gap-0.5 overflow-y-auto bg-rail py-3', className)}
    >
      {workspace.href ? (
        <Link
          href={workspace.href}
          aria-label={workspace.name}
          className="outline-none focus-visible:focus-ring"
        >
          {mark}
        </Link>
      ) : (
        <span role="img" aria-label={workspace.name}>
          {mark}
        </span>
      )}
      {nav.map((item) => (
        <Link
          key={item.id}
          href={item.href}
          aria-current={item.isCurrent ? 'page' : undefined}
          className={navLink(item.isCurrent)}
        >
          {item.label}
        </Link>
      ))}
      {projects.length ? (
        <span aria-hidden className="mx-3.5 my-2 h-px shrink-0 bg-[oklch(1_0_0/0.12)]" />
      ) : null}
      {projects.map((project) => (
        <TooltipTrigger key={project.key}>
          <Link
            href={project.href}
            aria-label={`${project.name}, ${project.openCount} open${project.mirrored ? ', mirrored from Backlog.md' : ''}`}
            aria-current={project.isCurrent ? 'page' : undefined}
            data-mirrored={project.mirrored || undefined}
            className={cn(
              'relative flex h-11 shrink-0 flex-col items-center justify-center gap-px font-mono text-[10.5px] font-medium outline-none focus-visible:focus-ring-inset',
              project.isCurrent ? 'bg-rail-on text-rail' : 'text-rail-fg hover:text-rail-on',
            )}
          >
            {project.mirrored ? (
              <span
                aria-hidden
                className="absolute top-[7px] right-[13px] size-[5px] bg-current opacity-75"
              />
            ) : null}
            <span>{project.key}</span>
            <span className="text-[9px] opacity-70">{project.openCount}</span>
          </Link>
          <Tooltip placement="right">
            {project.mirrored ? `${project.name} · mirrored from Backlog.md` : project.name}
          </Tooltip>
        </TooltipTrigger>
      ))}
      <span className="flex-1" />
      {settings ? (
        <Link
          href={settings.href}
          aria-current={settings.isCurrent ? 'page' : undefined}
          className={navLink(settings.isCurrent)}
        >
          {settings.label ?? 'Settings'}
        </Link>
      ) : null}
      {userMenu ? (
        <UserMenu user={user} {...userMenu} className="mx-auto mt-1.5" />
      ) : (
        <UserButton user={user} actions={userActions} />
      )}
    </nav>
  );
}

function UserButton({ user, actions }: { user: RailProps['user']; actions: readonly RailUserAction[] }) {
  const avatar: ReactNode = (
    <Avatar name={user.name} hue={user.hue} initials={user.initials} size="md" decorative />
  );
  if (!actions.length) {
    return (
      <span className="mx-auto mt-1.5" role="img" aria-label={user.name}>
        {avatar}
      </span>
    );
  }
  return (
    <MenuTrigger>
      <AriaButton
        aria-label={`${user.name}: account menu`}
        className="mx-auto mt-1.5 cursor-pointer rounded-full outline-none focus-visible:focus-ring"
      >
        {avatar}
      </AriaButton>
      <Menu placement="right bottom" onAction={(key) => actions.find((a) => a.id === key)?.onAction()}>
        {actions.map((action) => (
          <MenuItem key={action.id} id={action.id} tone={action.tone}>
            {action.label}
          </MenuItem>
        ))}
      </Menu>
    </MenuTrigger>
  );
}
