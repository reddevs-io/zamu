import { cn } from './cn';

/*
 * Blocked marker and subtask progress (margin.css .blk, .subp, .ring).
 */

export interface BlockedMarkerProps {
  /** Open blockers. The marker shows while any is open; with 0 it renders nothing. Omit when unknown. */
  count?: number;
  className?: string;
}

/** 20px --danger-soft pill "Blocked" on cards and rows. The count goes into the accessible name. */
export function BlockedMarker({ count, className }: BlockedMarkerProps) {
  if (count === 0) return null;
  return (
    <span
      data-blocked
      title={count != null ? `Blocked by ${count} open ${count === 1 ? 'task' : 'tasks'}` : undefined}
      className={cn(
        'inline-flex h-5 shrink-0 items-center rounded-pill bg-danger-soft px-1.75 text-xs font-semibold whitespace-nowrap text-danger',
        className,
      )}
    >
      Blocked
      {count != null ? (
        <span className="sr-only">
          {' '}
          by {count} open {count === 1 ? 'task' : 'tasks'}
        </span>
      ) : null}
    </span>
  );
}

/** The task view's line over the properties: "Blocked  by 2 open tasks" on --danger-soft. */
export function BlockedNotice({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <div
      role="note"
      className={cn(
        'flex items-center gap-3.5 rounded-md bg-danger-soft px-4 py-2.5 text-sm text-danger',
        className,
      )}
    >
      <b className="font-semibold">Blocked</b>
      <span className="font-medium">
        by {count} open {count === 1 ? 'task' : 'tasks'}
      </span>
    </div>
  );
}

/** 11px progress ring: --status-done arc on a --line track. Decorative; pair it with the count. */
export function SubtaskRing({
  done,
  total,
  size = 11,
  className,
}: {
  done: number;
  total: number;
  size?: number;
  className?: string;
}) {
  const share = total > 0 ? Math.max(0, Math.min(1, done / total)) : 0;
  const radius = 4.1;
  const length = 2 * Math.PI * radius;
  return (
    <svg
      aria-hidden
      viewBox="0 0 11 11"
      width={size}
      height={size}
      fill="none"
      className={cn('shrink-0 -rotate-90', className)}
    >
      <circle cx="5.5" cy="5.5" r={radius} strokeWidth="2.8" className="stroke-line" />
      {share > 0 ? (
        <circle
          cx="5.5"
          cy="5.5"
          r={radius}
          strokeWidth="2.8"
          className="stroke-status-done"
          strokeDasharray={`${share * length} ${length}`}
        />
      ) : null}
    </svg>
  );
}

export interface SubtaskProgressProps {
  /** Done subtasks (canceled ones excluded from both numbers by the caller). */
  done: number;
  total: number;
  /** `short` (default): "2/7" on cards and rows. `long`: "3 of 4 done" in the task view. */
  format?: 'short' | 'long';
  className?: string;
}

/** Ring plus count. Accessible name "2 of 7 subtasks done". */
export function SubtaskProgress({ done, total, format = 'short', className }: SubtaskProgressProps) {
  const label = `${done} of ${total} subtasks done`;
  return (
    <span
      role="img"
      aria-label={label}
      data-subtasks={`${done}/${total}`}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.25 text-xs whitespace-nowrap text-fg-2 tabular-nums',
        format === 'long' && 'font-semibold',
        className,
      )}
    >
      <SubtaskRing done={done} total={total} />
      <span aria-hidden>{format === 'long' ? `${done} of ${total} done` : `${done}/${total}`}</span>
    </span>
  );
}
