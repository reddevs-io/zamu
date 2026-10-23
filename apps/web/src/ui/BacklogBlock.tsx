import type { ReactNode } from 'react';
import { Link } from 'react-aria-components';
import { cn } from './cn';
import type { TaskStatus } from './meta';
import { StatusSquare } from './StatusSquare';
import { SystemActorAvatar } from './SystemActor';

/*
 * The read-only Backlog.md section of a mirrored task (ledger-m3.css .m3-bmd): the fields the app has no
 * column for, as label and value rows.
 */

export interface BacklogBlockProps {
  /** "BACK-786". */
  backlogId: string;
  /** Right-hand note: "read-only · fields this app doesn't have", or "kept from the import · read-only". */
  note?: ReactNode;
  /** KeyValueRow elements. */
  children: ReactNode;
  /** Defaults to "Backlog.md". */
  title?: string;
  className?: string;
}

export function BacklogBlock({
  backlogId,
  note,
  children,
  title = 'Backlog.md',
  className,
}: BacklogBlockProps) {
  return (
    <section
      aria-label={`${title} ${backlogId}`}
      className={cn('flex shrink-0 flex-col border border-line bg-src-bg', className)}
    >
      <div className="flex items-center gap-2 border-b border-line-2 px-2.5 py-[7px]">
        <SystemActorAvatar decorative />
        <b className="font-semibold">{title}</b>
        <span className="font-mono text-[11px] text-muted">{backlogId}</span>
        <span className="flex-1" />
        {note ? <span className="text-[11.5px] text-faint">{note}</span> : null}
      </div>
      <dl className="m-0">{children}</dl>
    </section>
  );
}

export interface KeyValueRowProps {
  /** "Labels", "Depends on", "Due · type". */
  label: ReactNode;
  children: ReactNode;
  /**
   * `wrap` (default): values flow in a row and wrap (labels, chips). `stack`: one value per line (task
   * links, references).
   */
  layout?: 'wrap' | 'stack' | 'plain';
  className?: string;
}

/** One row of the Backlog.md block: 112px faint label, then the values. Use inside BacklogBlock. */
export function KeyValueRow({ label, children, layout = 'wrap', className }: KeyValueRowProps) {
  return (
    <div
      className={cn(
        'grid min-w-0 grid-cols-[112px_minmax(0,1fr)] items-baseline gap-2.5 border-b border-line-2 px-2.5 py-1.5 text-[12px] last:border-b-0',
        className,
      )}
    >
      <dt className="text-[11px] text-faint">{label}</dt>
      <dd
        className={cn(
          'm-0 flex min-w-0',
          layout === 'wrap' && 'flex-wrap gap-x-1.5 gap-y-1',
          layout === 'stack' && 'flex-col gap-1',
          layout === 'plain' && 'block',
        )}
      >
        {children}
      </dd>
    </div>
  );
}

/** Hairline chip for a Backlog.md label: "webhooks". */
export function LabelChip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-[18px] items-center border border-line bg-surface px-1.5 text-[11px] whitespace-nowrap text-muted',
        className,
      )}
    >
      {children}
    </span>
  );
}

export interface TaskLinkProps {
  /** App key: "PAY-805", "PAY-786.1". */
  taskKey: string;
  title: string;
  status: TaskStatus;
  /** Route to the task. Navigates through the router (UIProvider). */
  href: string;
  className?: string;
}

/** Link to a task: status square, mono key, title truncated (Depends on, Subtasks). */
export function TaskLink({ taskKey, title, status, href, className }: TaskLinkProps) {
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex max-w-full min-w-0 cursor-pointer items-center gap-1.5 text-[12px] text-fg outline-none hover:underline hover:decoration-line focus-visible:focus-ring',
        className,
      )}
    >
      <StatusSquare status={status} />
      <span className="shrink-0 font-mono text-[10.5px] text-muted">{taskKey}</span>
      <span className="min-w-0 truncate">{title}</span>
    </Link>
  );
}

export interface MissingTaskLinkProps {
  /** The Backlog.md ID that matched nothing: "BACK-12". */
  backlogId: string;
  /** Defaults to "no task with this ID". */
  children?: ReactNode;
  className?: string;
}

/** Struck-through faint ID for a reference to a task that does not exist. */
export function MissingTaskLink({
  backlogId,
  children = 'no task with this ID',
  className,
}: MissingTaskLinkProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-[12px] text-faint line-through decoration-line',
        className,
      )}
    >
      <span className="font-mono text-[10.5px]">{backlogId}</span>
      {children}
    </span>
  );
}
