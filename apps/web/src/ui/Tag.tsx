import type { HTMLAttributes } from 'react';
import { cn } from './cn';

export interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  /** `accent` marks agents; `default` is used for people, roles and states such as Revoked. */
  tone?: 'default' | 'accent';
}

/** Small uppercase label with a hairline border: PERSON, AGENT, REVOKED. */
export function Tag({ tone = 'default', className, ...props }: TagProps) {
  return (
    <span
      {...props}
      className={cn(
        'inline-flex h-5 shrink-0 items-center border px-1.5 text-[10px] font-semibold tracking-[0.06em] uppercase',
        tone === 'accent' ? 'border-accent text-accent' : 'border-line text-muted',
        className,
      )}
    />
  );
}
