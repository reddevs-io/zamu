import type { CSSProperties, ReactNode } from 'react';
import { cn } from './cn';
import { LockGlyph } from './Glyphs';

/*
 * Margin label chip (margin.css .lb, .lbd, .more): a 20px pill with a 7px dot in the label's palette hue, then
 * the name in text-xs 500. On --bg-grp by default; on cards and inside popovers it sits on --bg-lane. Mirrored
 * labels add a lock (the name comes from the file; the colour stays editable).
 */

/** Number of label hues (--label-1 … --label-9); matches LABEL_COLOR_COUNT in @zamu/contracts. */
export const LABEL_HUES = 9;

/** Names of the nine hues, for swatch labels and screen readers. */
export const LABEL_HUE_NAMES = [
  'Blue',
  'Green',
  'Purple',
  'Red',
  'Cyan',
  'Amber',
  'Pink',
  'Teal',
  'Olive',
] as const;

/** CSS colour of a label hue: `var(--label-3)`. Out-of-range values fall back to hue 1. */
export function labelColor(color: number): string {
  const hue = Number.isInteger(color) && color >= 1 && color <= LABEL_HUES ? color : 1;
  return `var(--label-${hue})`;
}

/** The 7px dot (or a larger swatch with `size`). */
export function LabelDot({
  color,
  size = 7,
  className,
}: {
  color: number;
  size?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      data-color={color}
      className={cn('inline-block shrink-0 rounded-full', className)}
      style={{ width: size, height: size, background: labelColor(color) } as CSSProperties}
    />
  );
}

export interface LabelChipProps {
  /** The label's name. `children` also works (the Ledger Backlog.md chip passed the name as children). */
  name?: string;
  children?: ReactNode;
  /** Palette hue 1–9. Without one the chip has no dot. */
  color?: number;
  /** A label from Backlog.md: name locked, shown with a lock. */
  locked?: boolean;
  /** `sm` (default) 20px, text-xs; `lg` 24px, text-sm (task view, settings). */
  size?: 'sm' | 'lg';
  /** `grp` (default): --bg-grp, for rows and the page. `lane`: --bg-lane, on cards and in popovers. */
  surface?: 'grp' | 'lane';
  className?: string;
}

function chipClass(size: LabelChipProps['size'], surface: LabelChipProps['surface'], className?: string) {
  return cn(
    'inline-flex max-w-full min-w-0 shrink-0 items-center gap-1.25 rounded-pill font-medium whitespace-nowrap text-fg-2',
    size === 'lg' ? 'h-6 pr-2.25 pl-2 text-sm' : 'h-5 pr-1.75 pl-1.5 text-xs',
    surface === 'lane' ? 'bg-bg-lane' : 'bg-bg-grp',
    className,
  );
}

function ChipContent({
  name,
  children,
  color,
  locked,
}: Pick<LabelChipProps, 'name' | 'children' | 'color' | 'locked'>) {
  return (
    <>
      {color != null ? <LabelDot color={color} /> : null}
      <span className="min-w-0 truncate">{name ?? children}</span>
      {locked ? (
        <>
          <LockGlyph className="ml-0.5 text-fg-3" />
          <span className="sr-only">(from Backlog.md)</span>
        </>
      ) : null}
    </>
  );
}

/** A label on a card, row, filter or the task view. */
export function LabelChip({
  name,
  children,
  color,
  locked = false,
  size = 'sm',
  surface = 'grp',
  className,
}: LabelChipProps) {
  return (
    <span data-label={name ?? undefined} className={chipClass(size, surface, className)}>
      <ChipContent name={name} color={color} locked={locked}>
        {children}
      </ChipContent>
    </span>
  );
}

/** "+2" after the chips that fit (margin.css .more). The hidden names go in `title` and the accessible text. */
export function LabelOverflow({
  count,
  names,
  className,
}: {
  count: number;
  names?: readonly string[];
  className?: string;
}) {
  if (count <= 0) return null;
  return (
    <span title={names?.join(', ')} className={cn('shrink-0 text-xs text-fg-3', className)}>
      <span aria-hidden>+{count}</span>
      <span className="sr-only">{names?.length ? `and ${names.join(', ')}` : `and ${count} more`}</span>
    </span>
  );
}

export interface LabelListItem {
  id?: string;
  name: string;
  color: number;
  locked?: boolean;
}

/** The first `max` labels as chips, then "+N". Cards show 2, rows 1 to 3 depending on width. */
export function LabelList({
  labels,
  max = 2,
  surface,
  className,
}: {
  labels: readonly LabelListItem[];
  max?: number;
  surface?: LabelChipProps['surface'];
  className?: string;
}) {
  const shown = labels.slice(0, max);
  const hidden = labels.slice(max);
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5', className)}>
      {shown.map((label) => (
        <LabelChip
          key={label.id ?? label.name}
          name={label.name}
          color={label.color}
          locked={label.locked}
          surface={surface}
        />
      ))}
      <LabelOverflow count={hidden.length} names={hidden.map((label) => label.name)} />
    </span>
  );
}
