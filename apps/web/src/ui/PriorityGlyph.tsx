import { cn } from './cn';
import { GlyphBox } from './Glyphs';
import { PRIORITY_LABELS, type Priority, toPriority } from './meta';

/*
 * Margin priority glyph (margin.css .pri): Urgent is a --danger square with "!", High, Medium and Low are three
 * rising bars with the unused ones in --line, None is a dash in --fg-3. Cards and rows show only Urgent and
 * High (context="compact"); menus, the task view and filters show all five.
 */

/** Whether cards and list rows draw this priority. Medium, Low and None stay off them. */
export function showsPriorityOnCards(priority: Priority | number): boolean {
  const value = toPriority(priority);
  return value === 'urgent' || value === 'high';
}

const BARS: Record<'high' | 'medium' | 'low', number> = { high: 3, medium: 2, low: 1 };

function Glyph({ value, className, label }: { value: Priority; className?: string; label?: string }) {
  if (value === 'urgent') {
    return (
      <GlyphBox label={label} data-priority={value} className={className}>
        <svg aria-hidden viewBox="0 0 14 14" width="14" height="14">
          <rect width="14" height="14" rx="3" className="fill-danger" />
          <rect x="6.1" y="2.8" width="1.8" height="5.6" rx="0.9" className="fill-bg" />
          <circle cx="7" cy="10.6" r="1.05" className="fill-bg" />
        </svg>
      </GlyphBox>
    );
  }
  if (value === 'none') {
    return (
      <GlyphBox label={label} data-priority={value} className={className}>
        <svg aria-hidden viewBox="0 0 13 11" width="13" height="11">
          <rect x="0" y="4.75" width="13" height="1.5" className="fill-fg-3" />
        </svg>
      </GlyphBox>
    );
  }
  const lit = BARS[value];
  return (
    <GlyphBox label={label} data-priority={value} className={className}>
      <svg aria-hidden viewBox="0 0 13 11" width="13" height="11">
        <rect x="0" y="6.05" width="3" height="4.95" className={lit >= 1 ? 'fill-fg-2' : 'fill-line'} />
        <rect x="5" y="3.08" width="3" height="7.92" className={lit >= 2 ? 'fill-fg-2' : 'fill-line'} />
        <rect x="10" y="0" width="3" height="11" className={lit >= 3 ? 'fill-fg-2' : 'fill-line'} />
      </svg>
    </GlyphBox>
  );
}

export interface PriorityGlyphProps {
  priority: Priority | number;
  withLabel?: boolean;
  /**
   * `full` (default): every priority. `compact`: cards and rows; Medium, Low and None draw an empty slot of
   * the same size (keeps columns aligned), or nothing with `keepSpace={false}`.
   */
  context?: 'full' | 'compact';
  /** `compact` only: keep a blank 14px slot for hidden priorities (default true). */
  keepSpace?: boolean;
  /** Hide from assistive tech when the priority name is visible nearby. */
  decorative?: boolean;
  className?: string;
}

/** Priority glyph, optionally with its name. Accessible name "Priority: High" unless decorative. */
export function PriorityGlyph({
  priority,
  withLabel = false,
  context = 'full',
  keepSpace = true,
  decorative = false,
  className,
}: PriorityGlyphProps) {
  const value = toPriority(priority);
  if (context === 'compact' && !showsPriorityOnCards(value)) {
    return keepSpace ? (
      <span aria-hidden data-priority={value} className={cn('inline-block w-3.5 shrink-0', className)} />
    ) : null;
  }
  if (!withLabel) {
    return (
      <Glyph
        value={value}
        className={className}
        label={decorative ? undefined : `Priority: ${PRIORITY_LABELS[value]}`}
      />
    );
  }
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap', className)}>
      <Glyph value={value} />
      {PRIORITY_LABELS[value]}
    </span>
  );
}
