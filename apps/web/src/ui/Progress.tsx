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
  /** `sm` is 4px (rows), `md` is 6px (cycle card and pages). */
  size?: 'sm' | 'md';
  /** Draw "14/22" after the bar. */
  showCount?: boolean;
  /** Accessible name. Defaults to "Progress". */
  label?: string;
  className?: string;
}

/** Done in --done, then in progress in --accent at 55%, on a --track ground. */
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
        'flex min-w-[60px] flex-1 overflow-hidden bg-track',
        size === 'sm' ? 'h-1' : 'h-1.5',
        !showCount && className,
      )}
    >
      <span data-part="done" className="h-full bg-done" style={{ width: pct(safeDone, total) }} />
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

export interface TimeBarProps {
  /** Days elapsed since the cycle started (the current day counts). */
  elapsedDays: number;
  /** Cycle length in days. */
  totalDays: number;
  /** Draw "11/14d" after the bar. */
  showCount?: boolean;
  className?: string;
}

/** Time elapsed in a cycle: 6px bar, --muted fill on --track. */
export function TimeBar({ elapsedDays, totalDays, showCount = false, className }: TimeBarProps) {
  const elapsed = Math.max(0, Math.min(elapsedDays, totalDays));
  const bar = (
    <span
      role="progressbar"
      aria-label="Time elapsed"
      aria-valuemin={0}
      aria-valuemax={Math.max(totalDays, 0)}
      aria-valuenow={elapsed}
      aria-valuetext={`Day ${elapsed} of ${totalDays}`}
      className={cn('flex h-1.5 min-w-[60px] flex-1 bg-track', !showCount && className)}
    >
      <span className="h-full bg-muted" style={{ width: pct(elapsed, totalDays) }} />
    </span>
  );
  if (!showCount) return bar;
  return (
    <span className={cn('flex min-w-0 items-center gap-3', className)}>
      {bar}
      <Count>
        {elapsed}/{totalDays}d
      </Count>
    </span>
  );
}

function Count({ children }: { children: ReactNode }) {
  return (
    <span aria-hidden className="font-mono text-[10.5px] whitespace-nowrap text-muted">
      {children}
    </span>
  );
}

/** "3 days left", "1 day left", "Last day" (0), "Ended" (below 0). */
export function formatDaysLeft(daysLeft: number): string {
  if (daysLeft < 0) return 'Ended';
  if (daysLeft === 0) return 'Last day';
  return daysLeft === 1 ? '1 day left' : `${daysLeft} days left`;
}

export interface DaysLeftPillProps {
  daysLeft: number;
  /** Warn style at this many days or fewer (default 3). */
  warnAt?: number;
  /** Override the text, for example "3d left" in tight spots. */
  children?: string;
  className?: string;
}

/** 18px pill. In --warn on --warn-bg when `daysLeft` is `warnAt` or fewer, plain muted text otherwise. */
export function DaysLeftPill({ daysLeft, warnAt = 3, children, className }: DaysLeftPillProps) {
  const warn = daysLeft <= warnAt;
  return (
    <span
      data-warn={warn || undefined}
      className={cn(
        'inline-flex h-[18px] shrink-0 items-center px-1.5 text-[10.5px] whitespace-nowrap',
        warn ? 'bg-warn-bg font-semibold text-warn' : 'text-muted',
        className,
      )}
    >
      {children ?? formatDaysLeft(daysLeft)}
    </span>
  );
}
