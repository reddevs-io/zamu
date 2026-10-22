import type { CSSProperties } from 'react';
import { cn } from './cn';

export interface SkeletonProps {
  /** CSS width, for example 48 or '80%'. */
  width?: CSSProperties['width'];
  /** Height in px. Text lines are 8, headings 14. */
  height?: CSSProperties['height'];
  className?: string;
}

/** Flat placeholder bar in --line-2. Hidden from assistive tech; mark the region busy instead. */
export function Skeleton({ width = '100%', height = 8, className }: SkeletonProps) {
  return (
    <span
      aria-hidden
      className={cn('block shrink-0 bg-line-2 motion-safe:animate-pulse', className)}
      style={{ width, height }}
    />
  );
}
