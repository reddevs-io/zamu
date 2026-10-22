import type { HTMLAttributes } from 'react';
import { Keyboard } from 'react-aria-components';
import { cn } from './cn';

export interface KbdProps extends HTMLAttributes<HTMLElement> {
  /** `inverse` sits inside filled buttons and inherits their text color. */
  variant?: 'default' | 'inverse';
}

/** Keyboard hint, for example `Esc`, `/` or `⌘↵`. */
export function Kbd({ variant = 'default', className, ...props }: KbdProps) {
  return (
    <Keyboard
      {...props}
      className={cn(
        'inline-block shrink-0 border px-1 font-mono text-[9.5px] leading-4 font-normal',
        variant === 'default' ? 'border-line text-muted' : 'border-[oklch(0.6_0_0/0.4)] text-current',
        className,
      )}
    />
  );
}
