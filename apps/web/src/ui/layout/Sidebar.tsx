import { createContext, type ReactNode, useContext } from 'react';
import { Button as AriaButton, type ButtonProps as AriaButtonProps, Link } from 'react-aria-components';
import { Avatar, type MemberKind } from '../Avatar';
import { cn } from '../cn';
import { Kbd } from '../Kbd';
import { Tooltip, TooltipTrigger } from '../Tooltip';
import { ProjectTile } from './ProjectTile';
import { GearGlyph, HomeGlyph, SearchGlyph } from './ShellGlyphs';

/*
 * The Margin sidebar (frames 003–010; margin.css .side, .ws, .cmdk, .nav-i, .sec, .sub-i, .side-foot, .narrow):
 *
 *   [N] Northwind Labs ▾          workspace switcher (the shell puts its menu around SidebarWorkspaceButton)
 *   [⌕ Search or jump to    ⌘K]   opens the command palette
 *   ⌂ Home                   8    the count of what needs you
 *   Projects                 +    the "+" menu (New project, New from Backlog.md)
 *   [H] Harbor             123    projects; the current one lists its pages
 *       List · Board · Milestones · Cycles · Settings
 *   ◎ Workspace settings
 *   (AR) Ana Ruiz                 person menu (SidebarPersonButton)
 *
 * Collapsed (52px, the 1024 frames and `[`): icons only, names in tooltips, no sections or pages.
 * Presentation only: the shell passes the data, links and menus.
 */

const CollapsedContext = createContext(false);

/** True inside a collapsed Sidebar: the buttons below drop their labels. */
export function useSidebarCollapsed(): boolean {
  return useContext(CollapsedContext);
}

export interface SidebarPage {
  id: string;
  label: string;
  href: string;
  isCurrent?: boolean;
  /** Runs before the link navigates (the shell saves the List / Board choice). */
  onPress?: () => void;
}

export interface SidebarProject {
  key: string;
  name: string;
  openCount: number;
  href: string;
  /** The page is in this project: the row is highlighted when collapsed and its pages show. */
  isCurrent?: boolean;
  /** Tasks come from Backlog.md (said in the accessible name and the tooltip). */
  mirrored?: boolean;
  /** Pages listed under the row while it is expanded: List, Board, Milestones, Cycles, Settings. */
  pages: readonly SidebarPage[];
  /** Show the pages (the current project is expanded). */
  isExpanded?: boolean;
}

export interface SidebarProps {
  collapsed?: boolean;
  /** The workspace switcher: SidebarWorkspaceButton inside its MenuTrigger. */
  workspace: ReactNode;
  /** "Search or jump to": opens the command palette. */
  onSearch: () => void;
  home: {
    href: string;
    isCurrent?: boolean;
    /** Accent count after Home; 0 or unset shows none. Above 99 reads "99+". */
    count?: number;
    /** Wording of the count in the accessible name: "Home, 8 items need you". */
    countLabel?: (count: number) => string;
  };
  projects: readonly SidebarProject[];
  /** Right end of the Projects heading: the "+" menu. */
  projectsAction?: ReactNode;
  settings: { href: string; isCurrent?: boolean; label?: string };
  /** The person menu: SidebarPersonButton inside its trigger. */
  person: ReactNode;
  className?: string;
}

/** Count text: the number, or "99+" above 99. */
export function formatSidebarCount(count: number): string {
  return count > 99 ? '99+' : String(count);
}

const itemBase =
  'flex h-8 shrink-0 cursor-pointer items-center gap-2.25 rounded-md text-fg-2 font-medium whitespace-nowrap outline-none select-none focus-visible:shadow-[var(--focus-ring)]';

function itemClass(collapsed: boolean, current?: boolean) {
  return cn(
    itemBase,
    collapsed ? 'w-9 justify-center self-center px-0' : 'px-2',
    current ? 'bg-bg-lane text-fg' : 'hover:bg-bg-lane hover:text-fg',
  );
}

/** A name shown as a tooltip only while collapsed. */
function CollapsedTip({ label, children }: { label: string; children: ReactNode }) {
  const collapsed = useSidebarCollapsed();
  if (!collapsed) return <>{children}</>;
  return (
    <TooltipTrigger delay={300}>
      {children}
      <Tooltip placement="right">{label}</Tooltip>
    </TooltipTrigger>
  );
}

export function Sidebar({
  collapsed = false,
  workspace,
  onSearch,
  home,
  projects,
  projectsAction,
  settings,
  person,
  className,
}: SidebarProps) {
  const homeCount = home.count ?? 0;
  return (
    <CollapsedContext.Provider value={collapsed}>
      <nav
        aria-label="Main"
        data-collapsed={collapsed || undefined}
        className={cn(
          'flex min-h-0 flex-col gap-0.5 overflow-hidden border-r border-line bg-bg-side py-2.5 text-md text-fg',
          collapsed ? 'w-13 items-stretch px-1.5' : 'w-59 px-2',
          className,
        )}
      >
        {workspace}
        <CollapsedTip label="Search or jump to">
          <AriaButton
            onPress={onSearch}
            aria-label="Search or jump to"
            aria-keyshortcuts="Meta+K Control+K"
            className={cn(
              'mt-1.5 mb-2 flex h-8 shrink-0 cursor-pointer items-center gap-2 rounded-md border border-line-soft bg-surface text-sm text-fg-3 outline-none hover:text-fg-2 focus-visible:shadow-[var(--focus-ring)] dark:bg-bg',
              collapsed ? 'w-9 justify-center self-center px-0' : 'px-2',
            )}
          >
            <SearchGlyph />
            {collapsed ? null : (
              <>
                <span className="min-w-0 flex-1 truncate text-left">Search or jump to</span>
                <Kbd aria-hidden>⌘K</Kbd>
              </>
            )}
          </AriaButton>
        </CollapsedTip>
        <CollapsedTip label="Home">
          <Link
            href={home.href}
            aria-current={home.isCurrent ? 'page' : undefined}
            aria-label={
              homeCount > 0 ? `Home, ${home.countLabel ? home.countLabel(homeCount) : homeCount}` : 'Home'
            }
            className={itemClass(collapsed, home.isCurrent)}
          >
            <HomeGlyph />
            {collapsed ? null : <span className="min-w-0 flex-1 truncate">Home</span>}
            {homeCount > 0 && !collapsed ? (
              <span
                aria-hidden
                data-count={homeCount}
                className="rounded-pill bg-accent px-1.5 text-xs leading-4.25 font-semibold text-accent-ink tabular-nums"
              >
                {formatSidebarCount(homeCount)}
              </span>
            ) : null}
          </Link>
        </CollapsedTip>
        <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden">
          {collapsed ? null : (
            <div className="mt-3 flex h-6.5 shrink-0 items-center pr-0.5 pl-2 text-xs font-medium text-fg-3">
              <span className="flex-1">Projects</span>
              {projectsAction}
            </div>
          )}
          {collapsed ? <span aria-hidden className="h-2 shrink-0" /> : null}
          <ul aria-label="Projects" className="m-0 flex list-none flex-col gap-0.5 p-0">
            {projects.map((project) => (
              <SidebarProjectItem key={project.key} project={project} collapsed={collapsed} />
            ))}
          </ul>
        </div>
        <div className="mt-auto flex shrink-0 flex-col gap-0.5 pt-2">
          <CollapsedTip label={settings.label ?? 'Workspace settings'}>
            <Link
              href={settings.href}
              aria-current={settings.isCurrent ? 'page' : undefined}
              aria-label={collapsed ? (settings.label ?? 'Workspace settings') : undefined}
              className={itemClass(collapsed, settings.isCurrent)}
            >
              <GearGlyph />
              {collapsed ? null : (
                <span className="min-w-0 flex-1 truncate">{settings.label ?? 'Workspace settings'}</span>
              )}
            </Link>
          </CollapsedTip>
          {person}
        </div>
      </nav>
    </CollapsedContext.Provider>
  );
}

function SidebarProjectItem({ project, collapsed }: { project: SidebarProject; collapsed: boolean }) {
  const label = `${project.name}, ${project.openCount} open${project.mirrored ? ', mirrored from Backlog.md' : ''}`;
  const expanded = !collapsed && project.isExpanded && project.pages.length > 0;
  const pagesId = `sidebar-pages-${project.key}`;
  return (
    <li className="flex flex-col gap-0.5">
      <CollapsedTip label={project.mirrored ? `${project.name} · mirrored from Backlog.md` : project.name}>
        <Link
          href={project.href}
          aria-label={label}
          aria-current={project.isCurrent && !expanded ? 'page' : undefined}
          data-mirrored={project.mirrored || undefined}
          className={itemClass(collapsed, collapsed && project.isCurrent)}
        >
          <ProjectTile projectKey={project.key} name={project.name} />
          {collapsed ? null : (
            <>
              <span className="min-w-0 flex-1 truncate">{project.name}</span>
              <span aria-hidden className="text-xs font-normal text-fg-3 tabular-nums">
                {project.openCount}
              </span>
            </>
          )}
        </Link>
      </CollapsedTip>
      {expanded ? (
        <ul
          id={pagesId}
          aria-label={`${project.name} pages`}
          className="m-0 flex list-none flex-col gap-0.5 p-0"
        >
          {project.pages.map((page) => (
            <li key={page.id}>
              <Link
                href={page.href}
                onPress={page.onPress}
                aria-current={page.isCurrent ? 'page' : undefined}
                className={cn(
                  'ml-5 flex h-7 cursor-pointer items-center rounded-md px-2 text-sm whitespace-nowrap outline-none focus-visible:shadow-[var(--focus-ring)]',
                  page.isCurrent
                    ? 'bg-bg-lane font-medium text-fg'
                    : 'text-fg-2 hover:bg-bg-lane hover:text-fg',
                )}
              >
                {page.label}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export interface SidebarWorkspaceButtonProps extends Omit<AriaButtonProps, 'children' | 'className'> {
  name: string;
  /** The letter on the workspace mark; defaults to the name's first letter. */
  initial?: string;
}

/**
 * The workspace switcher button (.ws): the mark (--fg square with the --bg letter, readable in both themes),
 * the name and ▾. Put it in a MenuTrigger with the workspace menu.
 */
export function SidebarWorkspaceButton({ name, initial, ...props }: SidebarWorkspaceButtonProps) {
  const collapsed = useSidebarCollapsed();
  const letter = (initial ?? name.trim().charAt(0)).toUpperCase() || 'W';
  return (
    <AriaButton
      aria-label={`${name}: workspace menu`}
      {...props}
      className={cn(
        'flex h-8 shrink-0 cursor-pointer items-center gap-2 rounded-md font-semibold whitespace-nowrap text-fg outline-none hover:bg-bg-lane focus-visible:shadow-[var(--focus-ring)] aria-expanded:bg-bg-lane',
        collapsed ? 'w-9 justify-center self-center px-0' : 'px-1.5',
      )}
    >
      <span
        aria-hidden
        className="grid size-5.5 shrink-0 place-items-center rounded-sm bg-fg text-xs font-bold text-bg"
      >
        {letter}
      </span>
      {collapsed ? null : (
        <>
          <span className="min-w-0 flex-1 truncate text-left">{name}</span>
          <svg aria-hidden viewBox="0 0 7 5" width="7" height="5" className="mr-1 shrink-0 text-fg-3">
            <path d="M0 0h7L3.5 5z" fill="currentColor" />
          </svg>
        </>
      )}
    </AriaButton>
  );
}

export interface SidebarPersonButtonProps extends Omit<AriaButtonProps, 'children' | 'className'> {
  name: string;
  kind?: MemberKind;
  hue?: number;
}

/** The person row at the bottom (avatar and name). Put it in the person menu's trigger. */
export function SidebarPersonButton({ name, kind, hue, ...props }: SidebarPersonButtonProps) {
  const collapsed = useSidebarCollapsed();
  return (
    <AriaButton
      aria-label={`${name}: account menu`}
      {...props}
      className={cn(
        itemBase,
        collapsed ? 'w-9 justify-center self-center px-0' : 'px-2',
        'text-fg hover:bg-bg-lane aria-expanded:bg-bg-lane',
      )}
    >
      <Avatar name={name} kind={kind} hue={hue} size={22} decorative />
      {collapsed ? null : <span className="min-w-0 flex-1 truncate text-left">{name}</span>}
    </AriaButton>
  );
}
