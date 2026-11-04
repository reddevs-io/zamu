import type { CSSProperties } from 'react';
import { cn } from './cn';

/**
 * Milestones and cycles have no colour of their own: a diamond and a circle tell them apart, so status
 * keeps its colours. Glyphs draw in currentColor.
 */

export type MilestoneStatus = 'planned' | 'active' | 'completed';

export interface MilestoneGlyphProps {
  /** Filled diamond for Active and Completed milestones, outline for Planned. */
  filled?: boolean;
  /** Edge in px before rotation: 7 in chips and rows, 10 in page titles. */
  size?: number;
  /** Accessible name. Without it the glyph is decorative. */
  label?: string;
  className?: string;
}

/** Diamond: outline (planned) or filled (active, completed). */
export function MilestoneGlyph({ filled = false, size = 7, label, className }: MilestoneGlyphProps) {
  return (
    <span
      {...glyphA11y(label)}
      data-glyph={filled ? 'milestone-filled' : 'milestone'}
      style={{ width: size, height: size }}
      className={cn(
        'inline-block shrink-0 rotate-45',
        filled ? 'bg-current' : 'border-[1.5px] border-current',
        className,
      )}
    />
  );
}

/** Filled for active and completed milestones. */
export function isMilestoneFilled(status: MilestoneStatus): boolean {
  return status !== 'planned';
}

export type CycleGlyphState = 'empty' | 'progress' | 'done';

export interface CycleGlyphProps {
  /** `empty` (upcoming, or a task's cycle chip), `progress` (current: pie of elapsed time), `done` (completed). */
  state?: CycleGlyphState;
  /** 0 to 1, the filled share of the pie when `state` is `progress`. */
  progress?: number;
  /** Diameter in px: 9 in chips and rows, 12 to 14 in headers. */
  size?: number;
  /** Accessible name. Without it the glyph is decorative. */
  label?: string;
  className?: string;
}

/** Circle: outline (empty), pie (progress), full disc in --status-done (done). */
export function CycleGlyph({ state = 'empty', progress = 0.5, size = 9, label, className }: CycleGlyphProps) {
  const share = state === 'done' ? 1 : state === 'progress' ? clamp01(progress) : 0;
  const style = { width: size, height: size, '--p': `${Math.round(share * 1000) / 10}%` } as CSSProperties;
  return (
    <span
      {...glyphA11y(label)}
      data-glyph={`cycle-${state}`}
      style={style}
      className={cn(
        'inline-block shrink-0 rounded-full border-[1.5px] border-current',
        state !== 'empty' && 'bg-[conic-gradient(currentColor_0_var(--p),transparent_0)]',
        state === 'done' && 'text-status-done',
        className,
      )}
    />
  );
}

export interface NoneGlyphProps {
  /** `square` next to "No milestone", `circle` next to "No cycle". */
  shape?: 'square' | 'circle';
  size?: number;
  className?: string;
}

/** Dashed outline used by the "none" item of milestone and cycle pickers. Decorative. */
export function NoneGlyph({ shape = 'square', size = 9, className }: NoneGlyphProps) {
  return (
    <span
      aria-hidden
      data-glyph="none"
      style={{ width: size, height: size }}
      className={cn(
        'inline-block shrink-0 border-[1.5px] border-dashed border-fg-3',
        shape === 'circle' && 'rounded-full',
        className,
      )}
    />
  );
}

function glyphA11y(label: string | undefined) {
  return label ? ({ role: 'img', 'aria-label': label } as const) : ({ 'aria-hidden': true } as const);
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
