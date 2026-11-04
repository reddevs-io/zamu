import type { ReactNode } from 'react';
import { cn } from '../cn';

/*
 * Line glyphs of the sidebar and the view header (margin.css .ico-search, .ico-home, .ico-gear, .ico-col),
 * 16px boxes drawn in currentColor. Decorative: the control next to them carries the name.
 */

interface ShellGlyphProps {
  className?: string;
}

function Box({ className, children }: ShellGlyphProps & { children: ReactNode }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className={cn('shrink-0', className)}
    >
      {children}
    </svg>
  );
}

/** Magnifier: "Search or jump to", the header search. */
export function SearchGlyph({ className }: ShellGlyphProps) {
  return (
    <Box className={className}>
      <circle cx="6.75" cy="6.75" r="4.75" />
      <path d="m10.4 10.4 3.6 3.6" strokeLinecap="round" />
    </Box>
  );
}

/** Rounded square with a small block: Home. */
export function HomeGlyph({ className }: ShellGlyphProps) {
  return (
    <Box className={className}>
      <rect x="1.75" y="2.25" width="12.5" height="11.5" rx="3.5" />
      <rect x="5.75" y="5.75" width="4.5" height="3.5" rx="1" fill="currentColor" stroke="none" />
    </Box>
  );
}

/** Ring with a dot: settings. */
export function GearGlyph({ className }: ShellGlyphProps) {
  return (
    <Box className={className}>
      <circle cx="8" cy="8" r="6.25" />
      <circle cx="8" cy="8" r="2" fill="currentColor" stroke="none" />
    </Box>
  );
}

/** Frame with a left column: collapse or expand the sidebar. */
export function SidebarGlyph({ className }: ShellGlyphProps) {
  return (
    <Box className={className}>
      <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="2.5" />
      <path d="M5.75 3v10" />
    </Box>
  );
}
