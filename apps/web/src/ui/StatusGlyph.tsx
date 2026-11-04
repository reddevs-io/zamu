import { cn } from './cn';
import { GlyphBox } from './Glyphs';
import { STATUS_LABELS, type TaskStatus } from './meta';

/*
 * Margin status glyph (margin.css .st): a 13px ring. Backlog dashed, Todo plain, In progress half filled,
 * In review three quarters, Done filled (with a ring of the page between), Canceled struck through.
 * Backlog, Todo and Canceled are --fg-3; the others use --status-prog, --status-rev and --status-done.
 */

const RING: Record<TaskStatus, string> = {
  backlog: 'stroke-fg-3',
  todo: 'stroke-fg-3',
  in_progress: 'stroke-status-prog',
  in_review: 'stroke-status-rev',
  done: 'stroke-status-done',
  canceled: 'stroke-fg-3',
};

/** Inner pie paths on a 13×13 box, centre 6.5, radius 3.5 (the ring's inner edge less 1.5px padding). */
const HALF = 'M6.5 3a3.5 3.5 0 0 1 0 7z';
const THREE_QUARTERS = 'M6.5 6.5V3a3.5 3.5 0 1 1-3.5 3.5z';

export interface StatusGlyphProps {
  status: TaskStatus;
  /** Render the status name next to the glyph ("In progress"). */
  withLabel?: boolean;
  /** Side in px (default 13). */
  size?: number;
  /** Hide from assistive tech when the status name is already visible nearby. */
  decorative?: boolean;
  className?: string;
}

function Glyph({
  status,
  size,
  className,
  label,
}: {
  status: TaskStatus;
  size: number;
  className?: string;
  label?: string;
}) {
  return (
    <GlyphBox label={label} data-status={status} className={className}>
      <svg aria-hidden viewBox="0 0 13 13" width={size} height={size} fill="none">
        <circle
          cx="6.5"
          cy="6.5"
          r="5.75"
          strokeWidth="1.5"
          className={RING[status]}
          strokeDasharray={status === 'backlog' ? '2.2 1.6' : undefined}
        />
        {status === 'in_progress' ? <path d={HALF} className="fill-status-prog" /> : null}
        {status === 'in_review' ? <path d={THREE_QUARTERS} className="fill-status-rev" /> : null}
        {status === 'done' ? <circle cx="6.5" cy="6.5" r="3" className="fill-status-done" /> : null}
        {status === 'canceled' ? <path d="M3 3l7 7" strokeWidth="1.5" className="stroke-fg-3" /> : null}
      </svg>
    </GlyphBox>
  );
}

/** Status glyph, optionally with its name. Has the accessible name "In progress" unless decorative. */
export function StatusGlyph({
  status,
  withLabel = false,
  size = 13,
  decorative = false,
  className,
}: StatusGlyphProps) {
  if (!withLabel) {
    return (
      <Glyph
        status={status}
        size={size}
        className={className}
        label={decorative ? undefined : STATUS_LABELS[status]}
      />
    );
  }
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap', className)}>
      <Glyph status={status} size={size} />
      {STATUS_LABELS[status]}
    </span>
  );
}
