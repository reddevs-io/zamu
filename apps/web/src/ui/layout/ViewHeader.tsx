import type { ReactNode } from 'react';
import { Link } from 'react-aria-components';
import { cn } from '../cn';
import { ProjectTile } from './ProjectTile';

/*
 * The header of every project page (frames 003, 011, 029, 051; margin.css .vh, .crumb):
 *
 *   [H] Harbor / Milestones   [List|Board]  ≡ Filter  Display  ……  ● Backlog.md synced 38 min ago  [Search /]  [New task C]
 *
 * 52px, a --line-soft rule under it. The crumb is the project tile and serif name (a link to its list), then
 * the page and the task key. Every slot is optional and drawn in this order; the screens fill them:
 *
 *   viewSwitch  the List / Board SegmentedControl
 *   filter      the Filter button and menu (M5-08)
 *   display     the Display button and popover (M5-08)
 *   children    anything else on the left (the task view's ‹ › and position)
 *   sync        the Backlog.md status button (features/project-header MirrorSourceButton)
 *   search      a SearchField (width 200) registered with usePageSearchRef
 *   actions     the primary action (New task) and other buttons on the right
 *
 * Below 1100px the sync status hides (the 1024 frames); screens swap the search for an icon button there.
 */

export interface ViewHeaderProps {
  /** The project in the crumb. `href` links the name to the project's list. */
  project: { key: string; name: string; href?: string };
  /** Page after the project: "Milestones", "Settings". Omit on the list and board. */
  page?: ReactNode;
  /** Task key at the end of the crumb (the task view): "PAY-142". */
  taskKey?: string;
  viewSwitch?: ReactNode;
  filter?: ReactNode;
  display?: ReactNode;
  children?: ReactNode;
  sync?: ReactNode;
  search?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function ViewHeader({
  project,
  page,
  taskKey,
  viewSwitch,
  filter,
  display,
  children,
  sync,
  search,
  actions,
  className,
}: ViewHeaderProps) {
  const name = (
    <>
      <ProjectTile projectKey={project.key} name={project.name} />
      <span className="truncate font-serif text-xl font-medium text-fg">{project.name}</span>
    </>
  );
  return (
    <header
      className={cn(
        'relative z-3 flex h-13 shrink-0 items-center gap-2 border-b border-line-soft pr-3.5 pl-4.5',
        className,
      )}
    >
      <nav aria-label="Breadcrumb" className="mr-1.5 flex min-w-0 shrink items-center">
        <ol className="m-0 flex min-w-0 list-none items-center gap-2.25 p-0 whitespace-nowrap">
          <li className="flex min-w-0 items-center">
            {project.href ? (
              <Link
                href={project.href}
                aria-current={!page && !taskKey ? 'page' : undefined}
                className="flex min-w-0 cursor-pointer items-center gap-2.25 rounded-sm outline-none focus-visible:shadow-[var(--focus-ring)]"
              >
                {name}
              </Link>
            ) : (
              <span className="flex min-w-0 items-center gap-2.25">{name}</span>
            )}
          </li>
          {page ? (
            <li className="flex items-center gap-2.25">
              <span aria-hidden className="text-fg-3">
                /
              </span>
              <span aria-current={taskKey ? undefined : 'page'} className="text-md font-medium text-fg-2">
                {page}
              </span>
            </li>
          ) : null}
          {taskKey ? (
            <li className="flex items-center gap-2.25">
              <span aria-hidden className="text-fg-3">
                /
              </span>
              <span aria-current="page" className="text-sm font-semibold text-fg-2 tabular-nums">
                {taskKey}
              </span>
            </li>
          ) : null}
        </ol>
      </nav>
      {viewSwitch}
      {filter}
      {display}
      {children}
      <span className="min-w-2 flex-1" />
      {sync ? <div className="flex shrink-0 items-center max-[1099px]:hidden">{sync}</div> : null}
      {search}
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}
