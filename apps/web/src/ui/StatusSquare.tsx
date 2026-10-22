import { cn } from './cn';
import { STATUS_LABELS, type TaskStatus } from './meta';

const STATUS_CLASS: Record<TaskStatus, string> = {
  in_progress: 'bg-accent',
  in_review: 'bg-review',
  todo: 'border-[1.5px] border-muted',
  backlog: 'border-[1.5px] border-dashed border-faint',
  done: 'bg-done',
  canceled: 'bg-faint',
};

export function statusFill(status: TaskStatus): string {
  return STATUS_CLASS[status];
}

export interface StatusSquareProps {
  status: TaskStatus;
  /** Render the status name next to the square. */
  withLabel?: boolean;
  className?: string;
}

/** 8px status marker: filled for active states, outlined for todo, dashed for backlog. */
export function StatusSquare({ status, withLabel = false, className }: StatusSquareProps) {
  const base = cn('inline-block size-2 shrink-0', STATUS_CLASS[status]);
  if (!withLabel) {
    return (
      <span
        role="img"
        aria-label={STATUS_LABELS[status]}
        data-status={status}
        className={cn(base, className)}
      />
    );
  }
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap', className)}>
      <span aria-hidden data-status={status} className={base} />
      {STATUS_LABELS[status]}
    </span>
  );
}
