import type { HTMLAttributes } from 'react';
import { cn } from './cn';

export type PillTone = 'default' | 'warn' | 'accent' | 'ok';

const TONE: Record<PillTone, string> = {
  default: 'bg-bg-lane text-fg-2',
  warn: 'bg-danger-soft text-danger',
  accent: 'bg-accent-soft text-accent-text',
  ok: 'bg-ok-soft text-ok',
};

export interface PillProps extends HTMLAttributes<HTMLSpanElement> {
  /** `default` "in review", `warn` "blocked", `accent` "mentions you", `ok` "done", "On track". */
  tone?: PillTone;
}

/** Margin pill (margin.css .pill): 20px, radius pill, text-xs 500. The words carry the meaning, the tone backs it. */
export function Pill({ tone = 'default', className, ...props }: PillProps) {
  return (
    <span
      {...props}
      data-tone={tone}
      className={cn(
        'inline-flex h-5 shrink-0 items-center rounded-pill px-2 text-xs font-medium whitespace-nowrap',
        TONE[tone],
        className,
      )}
    />
  );
}
