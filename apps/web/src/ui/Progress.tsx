import type { ReactNode } from 'react';
import { cn } from './cn';
import { clamp01 } from './PlanningGlyph';

const pct = (part: number, total: number) => (total > 0 ? `${clamp01(part / total) * 100}%` : '0%');

export interface ProgressBarProps {
  /** Tasks done. */
  done: number;
  /** Tasks in progress or in review, drawn after `done` at half strength. */
  inProgress?: number;
  /** All tasks counted (canceled excluded by the caller). */
  total: number;
  /** `sm` is 4px (rows, margin.css .bar), `md` is 6px (page headers). */
  size?: 'sm' | 'md';
  /** Draw "14/22" after the bar. */
  showCount?: boolean;
  /** Accessible name. Defaults to "Progress". */
  label?: string;
  className?: string;
}

/** Margin progress bar (.bar): done in --status-done, then in progress in --accent at 55%, on --line, rounded. */
export function ProgressBar({
  done,
  inProgress = 0,
  total,
  size = 'sm',
  showCount = false,
  label = 'Progress',
  className,
}: ProgressBarProps) {
  const safeDone = Math.max(0, Math.min(done, total));
  const safeProgress = Math.max(0, Math.min(inProgress, total - safeDone));
  const bar = (
    <span
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.max(total, 0)}
      aria-valuenow={safeDone}
      aria-valuetext={`${safeDone} of ${total} done${safeProgress ? `, ${safeProgress} in progress` : ''}`}
      className={cn(
        'flex min-w-10 flex-1 overflow-hidden rounded-full bg-line',
        size === 'sm' ? 'h-1' : 'h-1.5',
        !showCount && className,
      )}
    >
      <span
        data-part="done"
        className="h-full rounded-full bg-status-done"
        style={{ width: pct(safeDone, total) }}
      />
      <span
        data-part="in-progress"
        className="h-full bg-accent opacity-55"
        style={{ width: pct(safeProgress, total) }}
      />
    </span>
  );
  if (!showCount) return bar;
  return (
    <span className={cn('flex min-w-0 items-center gap-3', className)}>
      {bar}
      <Count>
        {safeDone}/{total}
      </Count>
    </span>
  );
}

function Count({ children }: { children: ReactNode }) {
  return (
    <span aria-hidden className="text-xs whitespace-nowrap text-fg-2 tabular-nums">
      {children}
    </span>
  );
}

export type SegmentTone = 'done' | 'review' | 'progress' | 'muted';

const SEGMENT_FILL: Record<SegmentTone, string> = {
  done: 'bg-status-done',
  review: 'bg-status-rev',
  progress: 'bg-status-prog',
  muted: 'bg-fg-3',
};

export interface SegmentedBarProps {
  /** Segments in order, each a count and a tone: done, in review, in progress. */
  segments: readonly { tone: SegmentTone; value: number; label?: string }[];
  /** Everything counted (the rest of the bar stays --line). */
  total: number;
  /** `md` 8px (cycle card, page headers; default), `sm` 4px. */
  size?: 'sm' | 'md';
  /** Accessible name. Defaults to "Progress". */
  label?: string;
  className?: string;
}

/** Segmented progress (screens.css .seg-bar): done, in review and in progress side by side on --line. */
export function SegmentedBar({
  segments,
  total,
  size = 'md',
  label = 'Progress',
  className,
}: SegmentedBarProps) {
  const text = segments
    .filter((segment) => segment.value > 0)
    .map((segment) => `${segment.value} ${segment.label ?? segment.tone}`)
    .join(', ');
  return (
    <span
      role="img"
      aria-label={`${label}: ${text || 'nothing yet'} of ${total}`}
      className={cn(
        'flex min-w-10 flex-1 overflow-hidden rounded-full bg-line',
        size === 'md' ? 'h-2' : 'h-1',
        className,
      )}
    >
      {segments.map((segment) => (
        <span
          key={segment.tone}
          data-part={segment.tone}
          className={cn('block h-full', SEGMENT_FILL[segment.tone])}
          style={{ width: pct(segment.value, total) }}
        />
      ))}
    </span>
  );
}

/** Legend under a segmented bar: square swatch plus "12 done". */
export function SegmentLegend({
  segments,
  className,
}: {
  segments: readonly { tone: SegmentTone; value: number; label: string }[];
  className?: string;
}) {
  return (
    <span className={cn('flex flex-wrap gap-3.5 text-xs text-fg-3', className)}>
      {segments.map((segment) => (
        <span key={segment.tone} className="inline-flex items-center gap-1.25 tabular-nums">
          {/* 8px swatch with a 2px corner (screens.css .seg-key): below the radius scale. */}
          <i aria-hidden className={cn('inline-block size-2 rounded-[2px]', SEGMENT_FILL[segment.tone])} />
          {segment.value} {segment.label}
        </span>
      ))}
    </span>
  );
}
