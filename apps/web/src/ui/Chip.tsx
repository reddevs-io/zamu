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
 * 18px hairline chip with a glyph and text: "◇ Webhooks v2", "○ C12". Used on board cards, rows and
 * the property grid. The full text goes into `title` when `children` is a string.
 */
export function Chip({ glyph, children, maxWidth = 150, className, style, title, ...props }: ChipProps) {
  return (
    <span
      {...props}
      title={title ?? (typeof children === 'string' ? children : undefined)}
      style={{ maxWidth, ...style }}
      className={cn(
        'inline-flex h-[18px] min-w-0 shrink items-center gap-[5px] overflow-hidden border border-line px-[5px] text-[10.5px] whitespace-nowrap text-muted',
        className,
      )}
    >
      {glyph}
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
}
