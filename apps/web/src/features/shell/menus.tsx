import type { Theme } from '@zamu/contracts';
import { useState } from 'react';
import {
  Button as AriaButton,
  Menu as AriaMenu,
  Dialog,
  DialogTrigger,
  MenuTrigger,
} from 'react-aria-components';
import {
  Avatar,
  CheckGlyph,
  GearGlyph,
  type MemberKind,
  Menu,
  MenuGroup,
  MenuItem,
  MenuSeparator,
  PlusGlyph,
  Popover,
  SegmentedControl,
  type SegmentedItem,
  SidebarPersonButton,
  SidebarWorkspaceButton,
  useSidebarCollapsed,
} from '~/ui';

// The sidebar's menus (frames 004, 005, 008, 009): the workspace switcher, the "+" of the Projects
// heading, and the person menu with the theme switch.

export interface WorkspaceMenuProps {
  name: string;
  settingsHref: string;
  inviteHref: string;
  onNewProject: () => void;
  onNewFromBacklog: () => void;
}

/** The workspace switcher. v1 has one workspace per instance, so the list holds the current one. */
export function WorkspaceMenu({
  name,
  settingsHref,
  inviteHref,
  onNewProject,
  onNewFromBacklog,
}: WorkspaceMenuProps) {
  const collapsed = useSidebarCollapsed();
  const letter = name.trim().charAt(0).toUpperCase() || 'W';
  return (
    <MenuTrigger>
      <SidebarWorkspaceButton name={name} />
      <Menu
        placement={collapsed ? 'right top' : 'bottom start'}
        aria-label="Workspace"
        className="w-58"
        onAction={(key) => {
          if (key === 'new-project') onNewProject();
          if (key === 'new-from-backlog') onNewFromBacklog();
        }}
      >
        <MenuGroup title="Workspaces" aria-label="Workspaces">
          <MenuItem
            id="workspace-current"
            textValue={name}
            lead={
              <span
                aria-hidden
                className="grid size-5.5 place-items-center rounded-sm bg-fg text-xs font-bold text-bg"
              >
                {letter}
              </span>
            }
          >
            <span className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate">{name}</span>
              <span className="text-accent-text">
                <CheckGlyph />
              </span>
            </span>
          </MenuItem>
        </MenuGroup>
        <MenuSeparator />
        <MenuItem id="settings" href={settingsHref} lead={<GearGlyph className="size-3.5" />}>
          Workspace settings
        </MenuItem>
        <MenuItem id="invite" href={inviteHref} lead={<PlusGlyph />}>
          Invite people
        </MenuItem>
        <MenuSeparator />
        <MenuItem id="new-project" lead={<PlusGlyph />}>
          New project
        </MenuItem>
        <MenuItem id="new-from-backlog" lead={<PlusGlyph />}>
          New from Backlog.md
        </MenuItem>
      </Menu>
    </MenuTrigger>
  );
}

/** The "+" at the end of the Projects heading: New project, New from Backlog.md. */
export function NewProjectMenu({
  onNewProject,
  onNewFromBacklog,
}: Pick<WorkspaceMenuProps, 'onNewProject' | 'onNewFromBacklog'>) {
  return (
    <MenuTrigger>
      <AriaButton
        aria-label="New project"
        className="grid size-5.5 cursor-pointer place-items-center rounded-sm text-fg-3 outline-none hover:bg-bg-lane hover:text-fg focus-visible:shadow-[var(--focus-ring)] aria-expanded:bg-bg-lane aria-expanded:text-fg"
      >
        <PlusGlyph />
      </AriaButton>
      <Menu
        placement="bottom start"
        aria-label="New project"
        onAction={(key) => (key === 'new-from-backlog' ? onNewFromBacklog() : onNewProject())}
      >
        <MenuItem id="new-project" lead={<PlusGlyph />}>
          New project
        </MenuItem>
        <MenuItem id="new-from-backlog" lead={<PlusGlyph />}>
          New from Backlog.md
        </MenuItem>
      </Menu>
    </MenuTrigger>
  );
}

export const THEME_ITEMS: readonly SegmentedItem<Theme>[] = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];

export interface PersonMenuProps {
  user: { name: string; email?: string | null; kind?: MemberKind };
  /** Line under the name; defaults to the email. */
  subtitle?: string;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  myKeysHref: string;
  onShortcuts: () => void;
  onSignOut: () => void;
}

/** The person menu: name and email, the System / Light / Dark switch, My API keys, shortcuts, Sign out. */
export function PersonMenu({
  user,
  subtitle,
  theme,
  onThemeChange,
  myKeysHref,
  onShortcuts,
  onSignOut,
}: PersonMenuProps) {
  const collapsed = useSidebarCollapsed();
  const [isOpen, setOpen] = useState(false);
  const run = (id: string) => {
    setOpen(false);
    if (id === 'shortcuts') onShortcuts();
    if (id === 'sign-out') onSignOut();
  };
  const line = subtitle ?? user.email ?? undefined;
  return (
    <DialogTrigger isOpen={isOpen} onOpenChange={setOpen}>
      <SidebarPersonButton name={user.name} kind={user.kind} />
      <Popover
        placement={collapsed ? 'right bottom' : 'top start'}
        offset={8}
        className="w-65 min-w-0 overflow-visible"
      >
        <Dialog aria-label="Account" className="flex flex-col p-1.5 outline-none">
          <div className="flex min-h-12 items-center gap-2.25 px-2">
            <Avatar name={user.name} kind={user.kind} size={28} decorative />
            <div className="flex min-w-0 flex-col">
              <span className="truncate font-semibold">{user.name}</span>
              {line ? <span className="truncate text-xs text-fg-3">{line}</span> : null}
            </div>
          </div>
          <MenuSeparator />
          <div className="flex min-h-10 items-center justify-between gap-3 px-2">
            <span>Theme</span>
            <SegmentedControl aria-label="Theme" items={THEME_ITEMS} value={theme} onChange={onThemeChange} />
          </div>
          <AriaMenu
            aria-label="Account actions"
            onAction={(key) => run(String(key))}
            className="flex flex-col gap-px outline-none"
          >
            <MenuItem id="my-keys" href={myKeysHref} onAction={() => setOpen(false)}>
              My API keys
            </MenuItem>
            <MenuItem id="shortcuts" kbd="?">
              Keyboard shortcuts
            </MenuItem>
            <MenuSeparator />
            <MenuItem id="sign-out">Sign out</MenuItem>
          </AriaMenu>
        </Dialog>
      </Popover>
    </DialogTrigger>
  );
}
