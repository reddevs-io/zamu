import type { HTMLAttributes } from 'react';
import { cn } from './cn';

export interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  /** `accent` marks agents; `default` is used for people, roles and states such as Revoked. */
  tone?: 'default' | 'accent';
}

/**
 * Small role or state tag: Person, Agent, Revoked. Margin has no caps captions, so it is a Pill: --bg-lane, or
 * --accent-soft for agents. Pass the text in sentence case.
 */
export function Tag({ tone = 'default', className, ...props }: TagProps) {
  return (
    <span
      {...props}
      className={cn(
        'inline-flex h-5 shrink-0 items-center rounded-pill px-2 text-xs font-medium whitespace-nowrap',
        tone === 'accent' ? 'bg-accent-soft text-accent-text' : 'bg-bg-lane text-fg-2',
        className,
      )}
    />
  );
}
