import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

export interface ChipProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  /** Leading glyph: MilestoneGlyph, CycleGlyph, StatusSquare. */
  glyph?: ReactNode;
  /** Text after the glyph. Truncates with an ellipsis at `maxWidth`. */
  children: ReactNode;
  /** Max width in px (default 150, the card chip). */
  maxWidth?: number;
}

/**
 * 20px pill with a glyph and text, the label chip's shape on --bg-grp: "◇ Webhooks v2", "○ C12". Used on
 * board cards, rows and the property grid. The full text goes into `title` when `children` is a string.
 */
export function Chip({ glyph, children, maxWidth = 150, className, style, title, ...props }: ChipProps) {
  return (
    <span
      {...props}
      title={title ?? (typeof children === 'string' ? children : undefined)}
      style={{ maxWidth, ...style }}
      className={cn(
        'inline-flex h-5 min-w-0 shrink items-center gap-1.25 overflow-hidden rounded-pill bg-bg-grp pr-1.75 pl-1.5 text-xs font-medium whitespace-nowrap text-fg-2',
        className,
      )}
    >
      {glyph}
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
}
