import { ORPCError } from '@orpc/client';
import { useNavigate } from '@tanstack/react-router';
import type { MouseEvent, ReactNode } from 'react';
import { Button as AriaButton, Link } from 'react-aria-components';
import { useProjectSummary } from '~/features/project-header';
import { useNow } from '~/features/tasks/clock';
import { describeError } from '~/features/tasks/errors';
import { Banner, Button, cn, Skeleton, StatusSquare, type TaskStatus } from '~/ui';
import { planningToday } from './dates';

// Pieces shared by the milestone and cycle screens: error banners, breadcrumbs, list rows and groups.

/** The sentence after "Couldn't load milestones." */
export function loadErrorText(error: unknown): string {
  if (error instanceof ORPCError && error.status >= 500) return 'The server returned an error.';
  if (error instanceof TypeError) return 'Check your connection and try again.';
  const { message } = describeError(error);
  return message === 'The server could not be reached.' ? 'Check your connection and try again.' : message;
}

export interface LoadErrorProps {
  /** "milestones", "cycles", "this milestone". */
  what: string;
  error: unknown;
  onRetry: () => void;
  isRetrying?: boolean;
}

export function LoadError({ what, error, onRetry, isRetrying }: LoadErrorProps) {
  return (
    <div className="px-6 py-4">
      <Banner
        action={
          <Button variant="secondary" size="sm" isPending={isRetrying} onPress={onRetry}>
            Retry
          </Button>
        }
      >
        Couldn't load {what}. {loadErrorText(error)}
      </Banner>
    </div>
  );
}

/** Today in the server's time zone once hydrated; null during SSR and hydration. */
export function useServerToday(projectKey: string): string | null {
  const now = useNow();
  const project = useProjectSummary(projectKey);
  if (now == null) return null;
  return planningToday(now, project?.currentCycle ?? null);
}

export interface Crumb {
  label: string;
  href?: string;
}

/** "Payments / Milestones / Webhooks v2" in the 64px page header. */
export function Breadcrumbs({ items }: { items: readonly Crumb[] }) {
  return (
    <nav aria-label="Breadcrumbs" className="min-w-0">
      <ol className="m-0 flex min-w-0 list-none items-center gap-2 p-0 text-[13px] text-muted">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={item.label} className={cn('flex min-w-0 items-center gap-2', last && 'shrink')}>
              {item.href && !last ? (
                <Link
                  href={item.href}
                  className="shrink-0 cursor-pointer text-muted outline-none hover:text-fg focus-visible:focus-ring"
                >
                  {item.label}
                </Link>
              ) : (
                <span aria-current={last ? 'page' : undefined} className="truncate text-fg">
                  {item.label}
                </span>
              )}
              {last ? null : <span aria-hidden>/</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** 64px header with breadcrumbs on the left and actions on the right (milestone and cycle pages). */
export function CrumbHeader({ crumbs, actions }: { crumbs: readonly Crumb[]; actions?: ReactNode }) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-line px-6">
      <Breadcrumbs items={crumbs} />
      {actions ? <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}

// ---------------------------------------------------------------------------
// Lists (milestones, cycles): a header row, rows that open a page, collapsible groups
// ---------------------------------------------------------------------------

export function ListHead({ template, headers }: { template: string; headers: readonly string[] }) {
  return (
    // Visual column captions; each row's link and cells read on their own.
    <div
      aria-hidden
      className="grid h-7 shrink-0 items-center gap-4 border-b border-line px-6"
      style={{ gridTemplateColumns: template }}
    >
      {headers.map((header, index) => (
        <span key={header || index} className="caps truncate">
          {header}
        </span>
      ))}
    </div>
  );
}

export interface ListRowProps {
  template: string;
  /** Page the row opens. The first cell's link carries it for keyboard and screen reader users. */
  href: string;
  minHeight?: number;
  children: ReactNode;
}

/** A row that opens its page on click anywhere; the link inside stays the focusable target. */
export function ListRow({ template, href, minHeight = 52, children }: ListRowProps) {
  const navigate = useNavigate();
  const onClick = (event: MouseEvent<HTMLLIElement>) => {
    if ((event.target as HTMLElement).closest('a, button')) return;
    if (window.getSelection()?.toString()) return;
    void navigate({ href });
  };
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: the link in the first cell is the keyboard path
    <li
      onClick={onClick}
      style={{ gridTemplateColumns: template, minHeight }}
      className="grid cursor-pointer items-center gap-4 border-b border-line-2 px-6 py-2 hover:bg-band"
    >
      {children}
    </li>
  );
}

/** A cell of a ListRow. */
export function ListCell({ children, className }: { children?: ReactNode; className?: string }) {
  return <div className={cn('min-w-0', className)}>{children}</div>;
}

export function RowChevron() {
  return (
    <div aria-hidden className="text-right text-faint">
      ›
    </div>
  );
}

/** A link styled as the row's title: the keyboard and screen reader target of a ListRow. */
export function RowLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'min-w-0 cursor-pointer truncate font-semibold text-fg outline-none hover:underline focus-visible:focus-ring',
        className,
      )}
    >
      {children}
    </Link>
  );
}

export interface GroupBandProps {
  label: string;
  count: number;
  /** Folding group: draws ▸/▾ and toggles on press. */
  expanded?: boolean;
  onToggle?: () => void;
  status?: TaskStatus;
  className?: string;
}

/** 31px band with a caps label and a count: "UPCOMING 2", "▸ COMPLETED 11". */
export function GroupBand({ label, count, expanded, onToggle, status, className }: GroupBandProps) {
  const content = (
    <>
      {onToggle ? (
        <span aria-hidden className="w-2 text-faint">
          {expanded ? '▾' : '▸'}
        </span>
      ) : null}
      {status ? <StatusSquare status={status} /> : null}
      <span>{label}</span>
      <span className="font-mono text-[10px] tracking-normal text-faint">{count}</span>
    </>
  );
  const base = cn(
    'flex h-[31px] w-full shrink-0 items-center gap-2.5 border-b border-line-2 bg-band px-6 text-left text-[11px] font-semibold tracking-[0.06em] uppercase',
    className,
  );
  if (!onToggle) return <div className={base}>{content}</div>;
  return (
    <AriaButton
      aria-expanded={expanded}
      onPress={onToggle}
      className={cn(base, 'cursor-pointer outline-none focus-visible:focus-ring-inset')}
    >
      {content}
    </AriaButton>
  );
}

/** Skeleton rows of a list while it loads (frame 20). */
export function ListSkeleton({
  template,
  widths,
}: {
  template: string;
  widths: readonly (string | number)[][];
}) {
  return (
    <div role="status" aria-busy="true" aria-label="Loading">
      {widths.map((row, index) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder rows
          key={index}
          className="grid min-h-[52px] items-center gap-4 border-b border-line-2 px-6"
          style={{ gridTemplateColumns: template }}
        >
          {row.map((width, cell) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder cells
            <Skeleton key={cell} width={width} height={cell === 3 ? 4 : 8} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** List of ListRows. Put the ListHead before it. */
export function ListTable({ label, children }: { label: string; children: ReactNode }) {
  return (
    <ul aria-label={label} className="m-0 flex list-none flex-col p-0">
      {children}
    </ul>
  );
}
