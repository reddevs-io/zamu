import type { ReactNode } from 'react';
import { Link } from 'react-aria-components';
import { cn } from '../cn';

export interface SettingsNavItem {
  id: string;
  label: string;
  href: string;
  isCurrent?: boolean;
  /** Drawn after the label: a status dot ("Backlog.md ●"), a count. */
  trailing?: ReactNode;
}

export interface SettingsNavSection {
  label: string;
  items: readonly SettingsNavItem[];
}

/*
 * Margin settings nav (screens.css .set-nav, frame 116): 220px, a --line-soft rule on the right, on the page
 * background. Section headers in text-xs 500 --fg-3; items 30px, text-sm 500 --fg-2, radius md; the current
 * one on --bg-lane in --fg. The title ("Settings") is the nav's accessible name and is drawn above the
 * sections unless `hideTitle` is set (project settings, where the header says "Settings" already).
 */
export function SettingsNav({
  title = 'Settings',
  hideTitle = false,
  sections,
  className,
}: {
  title?: string;
  /** Keep the title as the accessible name only. */
  hideTitle?: boolean;
  sections: readonly SettingsNavSection[];
  className?: string;
}) {
  return (
    <nav
      aria-label={title}
      className={cn(
        'flex w-55 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-line-soft px-2.5 py-4.5',
        className,
      )}
    >
      {hideTitle ? null : <div className="px-2 pb-1 text-lg font-semibold text-fg">{title}</div>}
      {sections.map((section, index) => (
        <div key={section.label} className="flex flex-col gap-0.5">
          <div
            className={cn(
              'flex h-6.5 items-center px-2 text-xs font-medium text-fg-3',
              index === 0 && hideTitle ? 'mt-1' : 'mt-3',
            )}
          >
            {section.label}
          </div>
          {section.items.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              aria-current={item.isCurrent ? 'page' : undefined}
              className={cn(
                'flex h-7.5 items-center gap-2 rounded-md px-2 text-sm font-medium outline-none focus-visible:focus-ring-inset',
                item.isCurrent ? 'bg-bg-lane text-fg' : 'text-fg-2 hover:bg-bg-lane hover:text-fg',
              )}
            >
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.trailing}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}
