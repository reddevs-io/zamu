import type { TaskStatus } from './meta';
import { StatusGlyph } from './StatusGlyph';

/** Fill classes per status for bars and segments (StatusBar). Margin status colours. */
const STATUS_CLASS: Record<TaskStatus, string> = {
  in_progress: 'bg-status-prog',
  in_review: 'bg-status-rev',
  todo: 'border-[1.5px] border-fg-3',
  backlog: 'border-[1.5px] border-dashed border-fg-3',
  done: 'bg-status-done',
  canceled: 'bg-fg-3',
};

export function statusFill(status: TaskStatus): string {
  return STATUS_CLASS[status];
}

export interface StatusSquareProps {
  status: TaskStatus;
  /** Render the status name next to the glyph. */
  withLabel?: boolean;
  className?: string;
}

/**
 * The Ledger name of the status marker. It now draws the Margin StatusGlyph (13px ring); new code imports
 * StatusGlyph. Accessible name: the status ("In progress").
 */
export function StatusSquare({ status, withLabel = false, className }: StatusSquareProps) {
  return <StatusGlyph status={status} withLabel={withLabel} className={className} />;
}
