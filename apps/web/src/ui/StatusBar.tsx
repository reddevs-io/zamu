import { cn } from './cn';
import { OPEN_STATUSES, STATUS_LABELS, type TaskStatus } from './meta';
import { statusFill } from './StatusSquare';

export interface StatusBarProps {
  /** Open-task counts per status. Missing statuses count as 0. */
  counts: Partial<Record<TaskStatus, number>>;
  /** Statuses to draw, in order. Defaults to In progress, In review, Todo, Backlog. */
  statuses?: readonly TaskStatus[];
  /** Width in px. The projects table uses 200. */
  width?: number;
  className?: string;
}

/** Segmented bar of open tasks by status; each segment's width is proportional to its count. */
export function StatusBar({ counts, statuses = OPEN_STATUSES, width = 120, className }: StatusBarProps) {
  const segments = statuses
    .map((status) => ({ status, count: counts[status] ?? 0 }))
    .filter((segment) => segment.count > 0);
  const label = segments.length
    ? segments.map((s) => `${s.count} ${STATUS_LABELS[s.status].toLowerCase()}`).join(', ')
    : 'No open tasks';
  return (
    <span
      role="img"
      aria-label={label}
      className={cn('flex h-1.5 shrink-0 gap-0.5', className)}
      style={{ width }}
    >
      {segments.map((segment) => (
        <span
          key={segment.status}
          data-status={segment.status}
          className={cn('block h-full min-w-1', statusFill(segment.status))}
          style={{ flex: segment.count }}
        />
      ))}
    </span>
  );
}
