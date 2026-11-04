import type { ReactNode } from 'react';
import { Link, type LinkProps } from 'react-aria-components';
import { cn } from './cn';

/*
 * Source badge (margin.css .bm): a 20px outlined pill "Backlog.md" on mirrored tasks, milestones and pages,
 * with an optional sync dot: synced (--status-done), syncing (--status-prog), sync failed (--danger).
 */

export type SyncState = 'synced' | 'syncing' | 'failed';

const DOT: Record<SyncState, string> = {
  synced: 'bg-status-done',
  syncing: 'bg-status-prog motion-safe:animate-pulse',
  failed: 'bg-danger',
};

const SUFFIX: Record<SyncState, string | null> = {
  synced: null,
  syncing: 'syncing',
  failed: 'sync failed',
};

export interface SourceBadgeProps {
  /** Without it, no dot (the task view's badge that links to the file). */
  sync?: SyncState;
  /** Defaults to "Backlog.md". */
  label?: ReactNode;
  /** A link to the file or the mirror's settings. */
  href?: LinkProps['href'];
  /** Opens in a new tab (links to the repository). */
  external?: boolean;
  className?: string;
}

/** "● Backlog.md", "● Backlog.md · syncing", "● Backlog.md · sync failed". */
export function SourceBadge({
  sync,
  label = 'Backlog.md',
  href,
  external = false,
  className,
}: SourceBadgeProps) {
  const suffix = sync ? SUFFIX[sync] : null;
  const classes = cn(
    'inline-flex h-5 shrink-0 items-center gap-1.25 rounded-pill border border-line px-1.75 text-xs font-medium whitespace-nowrap text-fg-2',
    className,
  );
  const content = (
    <>
      {sync ? (
        <span aria-hidden data-sync={sync} className={cn('size-1.5 shrink-0 rounded-full', DOT[sync])} />
      ) : null}
      <span>{label}</span>
      {suffix ? (
        <span>· {suffix}</span>
      ) : sync === 'synced' ? (
        <span className="sr-only">· synced</span>
      ) : null}
    </>
  );
  if (href) {
    return (
      <Link
        href={href}
        {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
        className={cn(
          classes,
          'cursor-pointer outline-none hover:bg-bg-lane hover:text-fg focus-visible:shadow-[var(--focus-ring)]',
        )}
      >
        {content}
      </Link>
    );
  }
  return <span className={classes}>{content}</span>;
}
