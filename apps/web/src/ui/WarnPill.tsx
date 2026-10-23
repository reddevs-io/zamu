import type { HTMLAttributes } from 'react';
import { cn } from './cn';

export interface WarnPillProps extends HTMLAttributes<HTMLSpanElement> {
  /** Short sentence-case text: "no update 26h", "11 days overdue", "ends tomorrow", "Stalled 26h". */
  children: string;
}

/**
 * 18px warning pill: --warn text on --warn-bg, 10.5px semibold. Names why a row needs attention (stalled
 * work, overdue milestones, cycles about to end). The text carries the meaning, the colour only backs it.
 */
export function WarnPill({ className, ...props }: WarnPillProps) {
  return (
    <span
      {...props}
      data-tone="warn"
      className={cn(
        'inline-flex h-[18px] shrink-0 items-center bg-warn-bg px-1.5 font-sans text-[10.5px] font-semibold whitespace-nowrap text-warn',
        className,
      )}
    />
  );
}
