import type { CSSProperties } from 'react';
import { cn } from './cn';

export interface SkeletonProps {
  /** CSS width, for example 48 or '80%'. */
  width?: CSSProperties['width'];
  /** Height in px. Text lines are 10 (default), chips 18 to 20. */
  height?: CSSProperties['height'];
  /** A circle (avatar, status glyph): width = height. */
  round?: boolean;
  className?: string;
}

/**
 * Margin placeholder bar (margin.css .skel): rounded, a soft --bg-lane to --line-soft gradient. Hidden from
 * assistive tech; mark the region busy (aria-busy) instead.
 */
export function Skeleton({ width = '100%', height = 10, round = false, className }: SkeletonProps) {
  return (
    <span
      aria-hidden
      data-skeleton
      className={cn(
        'block shrink-0 bg-linear-to-r from-bg-lane via-line-soft to-bg-lane motion-safe:animate-pulse',
        // 5px: a text bar's corner (margin.css .sk), between radius-sm and none.
        round ? 'rounded-full' : 'rounded-[5px]',
        className,
      )}
      style={{ width: round ? height : width, height }}
    />
  );
}

/** A list row while loading (the kit's "loading" row): priority, key, status, title, then label and avatar. */
export function SkeletonRow({
  className,
  titleWidth = '45%',
}: {
  className?: string;
  titleWidth?: CSSProperties['width'];
}) {
  return (
    <div aria-hidden className={cn('flex h-(--row-h) items-center gap-2.5 pr-4.5 pl-4', className)}>
      <Skeleton width={14} />
      <Skeleton width={54} />
      <Skeleton round height={13} />
      <Skeleton width={titleWidth} />
      <span className="flex-1" />
      <Skeleton width={60} />
      <Skeleton round height={18} />
    </div>
  );
}

/** `count` loading rows with a busy region around them. */
export function SkeletonRows({
  count = 6,
  label = 'Loading',
  className,
}: {
  count?: number;
  label?: string;
  className?: string;
}) {
  const widths = ['45%', '60%', '38%', '52%', '30%', '48%'];
  return (
    <div role="status" aria-busy="true" aria-label={label} className={cn('flex flex-col', className)}>
      {Array.from({ length: count }, (_, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders.
        <SkeletonRow key={index} titleWidth={widths[index % widths.length]} />
      ))}
    </div>
  );
}

/** A board card while loading (the kit's "Loading" card). */
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn('flex flex-col gap-1.5 rounded-md bg-surface px-3.25 py-2.75 shadow-card', className)}
    >
      <Skeleton width="80%" />
      <Skeleton width="45%" />
      <div className="flex items-center gap-1.5 pt-1">
        <Skeleton width={48} />
        <Skeleton width={60} height={18} className="rounded-pill" />
      </div>
    </div>
  );
}
