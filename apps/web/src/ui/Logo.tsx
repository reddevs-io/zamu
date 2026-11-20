import { cn } from './cn';

/*
 * The Zamu mark (Dial): four quarters of one disc, a roster of people (round edge) and agents (square
 * corner, the agent avatar's radius) with the on-duty quarter in the accent. Drawn in the theme's fg and
 * accent, so it follows light and dark. Below 32px it switches to the drawing made for the 16px pixel grid,
 * which keeps the gaps on whole pixels. assets/ and apps/web/public/ hold the same shapes as files.
 */

export interface ZamuMarkProps {
  /** Rendered width and height in px. */
  size?: number;
  /** One colour: the accent quarter takes the fg colour too. */
  mono?: boolean;
  /** Accessible name; leave it out when the word Zamu is next to the mark. */
  label?: string;
  className?: string;
}

export function ZamuMark({ size = 16, mono = false, label, className }: ZamuMarkProps) {
  const small = size < 32;
  const accent = mono ? 'fill-fg' : 'fill-accent';
  return (
    <svg
      role="img"
      aria-label={label ?? 'Zamu'}
      aria-hidden={label ? undefined : true}
      // Both drawings leave the same margin: 1/16 of the box on each side.
      viewBox={small ? '0 0 16 16' : '7 7 50 50'}
      width={size}
      height={size}
      data-glyph="zamu"
      className={cn('shrink-0', className)}
    >
      {small ? (
        <>
          <path className="fill-fg" d="M7 6V1A6 6 0 0 0 1 7H6A1 1 0 0 0 7 6Z" />
          <rect className={accent} x="9" y="1" width="6" height="6" rx="1.5" />
          <rect className="fill-fg" x="1" y="9" width="6" height="6" rx="1.5" />
          <path className="fill-fg" d="M9 10V15A6 6 0 0 0 15 9H10A1 1 0 0 0 9 10Z" />
        </>
      ) : (
        <>
          <path className="fill-fg" d="M29 26V10A19 19 0 0 0 10 29H26A3 3 0 0 0 29 26Z" />
          <rect className={accent} x="35" y="10" width="19" height="19" rx="5.25" />
          <rect className="fill-fg" x="10" y="35" width="19" height="19" rx="5.25" />
          <path className="fill-fg" d="M35 38V54A19 19 0 0 0 54 35H38A3 3 0 0 0 35 38Z" />
        </>
      )}
    </svg>
  );
}
