import { cn } from './cn';
import { PRIORITY_LABELS, type Priority, toPriority } from './meta';

const GLYPH: Record<Priority, string> = {
  urgent: '■■■',
  high: '■■■',
  medium: '■■',
  low: '■',
  none: '—',
};

export interface PriorityGlyphProps {
  priority: Priority | number;
  withLabel?: boolean;
  className?: string;
}

/** Bars glyph: Urgent ■■■ in danger, High ■■■, Medium ■■, Low ■, None —. */
export function PriorityGlyph({ priority, withLabel = false, className }: PriorityGlyphProps) {
  const value = toPriority(priority);
  const glyphClass = cn(
    'shrink-0 text-[9px] tracking-[1px] whitespace-nowrap',
    value === 'urgent' ? 'text-danger' : value === 'none' ? 'text-faint' : 'text-fg',
  );
  if (!withLabel) {
    return (
      <span
        role="img"
        aria-label={`Priority: ${PRIORITY_LABELS[value]}`}
        data-priority={value}
        className={cn(glyphClass, className)}
      >
        {GLYPH[value]}
      </span>
    );
  }
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap', className)}>
      <span aria-hidden data-priority={value} className={glyphClass}>
        {GLYPH[value]}
      </span>
      {PRIORITY_LABELS[value]}
    </span>
  );
}
