import type { HTMLAttributes, ReactNode } from 'react';
import { Keyboard } from 'react-aria-components';
import { cn } from './cn';

export interface KbdProps extends HTMLAttributes<HTMLElement> {
  /**
   * `default`: --kbd-bg chip in --fg-2 (menus, rows, search fields).
   * `inverse`: a translucent chip in the text colour, for filled surfaces (primary buttons, tooltips, toasts).
   */
  variant?: 'default' | 'inverse';
}

/** Key hint (margin.css .kbd): one key or a chord in one chip, for example `C`, `⇧D` or `⌘↵`. */
export function Kbd({ variant = 'default', className, ...props }: KbdProps) {
  return (
    <Keyboard
      {...props}
      className={cn(
        'inline-grid h-4.5 min-w-4.5 shrink-0 place-items-center rounded-sm px-1 font-sans text-xs leading-none font-medium whitespace-nowrap',
        // inverse: currentColor is the surface's text colour, so the chip is a 15% tint of it.
        variant === 'default' ? 'bg-kbd-bg text-fg-2' : 'bg-current/15',
        className,
      )}
    />
  );
}

export interface KeyHintProps {
  /**
   * One key or chord ("S", "⇧D", "⌘↵"), or a sequence drawn as separate chips ("G", "H" for G then H).
   */
  keys: string | readonly string[];
  /** Text after the keys, as in menu footers: "↵ toggle", "Esc done". */
  children?: ReactNode;
  variant?: KbdProps['variant'];
  className?: string;
}

/**
 * Keys plus an optional caption (menu and peek footers). The chips are hidden from assistive tech: put the
 * shortcut on the control with aria-keyshortcuts.
 */
export function KeyHint({ keys, children, variant, className }: KeyHintProps) {
  const list = typeof keys === 'string' ? [keys] : keys;
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap', className)}>
      <span aria-hidden className="inline-flex items-center gap-1">
        {list.map((key) => (
          <Kbd key={key} variant={variant}>
            {key}
          </Kbd>
        ))}
      </span>
      {children}
    </span>
  );
}
