import type { ReactNode } from 'react';
import { Link } from 'react-aria-components';
import { cn } from './cn';

export interface ViewTab {
  id: string;
  label: string;
  href: string;
  /** Leading glyph: MilestoneGlyph for Milestones, CycleGlyph for Cycles. */
  glyph?: ReactNode;
  /** Mono count after the label: "Tasks 12". */
  count?: number;
  /** Mono note after the label when there is no count: "C12 · 3d left". */
  note?: string;
}

export interface ViewTabsProps {
  items: readonly ViewTab[];
  /** id of the tab for the current page. */
  currentId: string;
  'aria-label'?: string;
  className?: string;
}

/**
 * Project header tabs (Tasks, Milestones, Cycles). Each tab is a link to its page; the current one is
 * bold with a 2px --fg underline and aria-current="page". Render nothing when only Tasks would show.
 */
export function ViewTabs({ items, currentId, className, ...props }: ViewTabsProps) {
  return (
    <nav
      aria-label={props['aria-label'] ?? 'Project views'}
      className={cn(
        'flex h-9 shrink-0 items-stretch gap-5 border-b border-line px-6 text-[12.5px]',
        className,
      )}
    >
      {items.map((tab) => {
        const isCurrent = tab.id === currentId;
        return (
          <Link
            key={tab.id}
            href={tab.href}
            aria-current={isCurrent ? 'page' : undefined}
            className={cn(
              '-mb-px flex cursor-pointer items-center gap-1.5 border-b-2 outline-none focus-visible:focus-ring-inset',
              isCurrent
                ? 'border-fg font-semibold text-fg'
                : 'border-transparent font-medium text-muted hover:text-fg',
            )}
          >
            {tab.glyph}
            {tab.label}
            {tab.count != null || tab.note ? (
              <span className="font-mono text-[10px] font-normal text-faint">{tab.count ?? tab.note}</span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
