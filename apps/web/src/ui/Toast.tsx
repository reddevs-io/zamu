import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { cn } from './cn';
import { Kbd } from './Kbd';

export interface ToastProps {
  /** "PAY-140 moved to In review". */
  children: ReactNode;
  /** Inline action: { label: 'Undo', onAction }. */
  action?: { label: string; onAction: () => void };
  /** Shortcut hint after the action: "⌘Z". The page binds the key itself. */
  kbd?: string;
  /** Called when the timeout runs out. */
  onDismiss?: () => void;
  /** Auto-dismiss after this many ms (paused while hovered or focused). No timeout when unset. */
  timeout?: number;
  /** Float at the bottom center of the nearest positioned ancestor (the board). */
  floating?: boolean;
  className?: string;
}

/**
 * Margin toast (margin.css .toast): 42px, radius md, --fg with --bg text, --shadow-lift; an underlined action
 * ("Undo") and its key. Announced politely (role="status").
 */
export function Toast({
  children,
  action,
  kbd,
  onDismiss,
  timeout,
  floating = false,
  className,
}: ToastProps) {
  const [isPaused, setPaused] = useState(false);
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  useEffect(() => {
    if (!timeout || isPaused) return;
    const id = window.setTimeout(() => dismiss.current?.(), timeout);
    return () => window.clearTimeout(id);
  }, [timeout, isPaused]);
  return (
    <div
      role="status"
      aria-live="polite"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={cn(
        'flex h-10.5 items-center gap-3 rounded-md bg-fg pr-2 pl-3.5 text-sm whitespace-nowrap text-bg shadow-lift',
        floating && 'absolute bottom-5.5 left-1/2 z-7 -translate-x-1/2',
        className,
      )}
    >
      <span>{children}</span>
      {action ? (
        <AriaButton
          onPress={action.onAction}
          className="cursor-pointer rounded-sm font-medium underline underline-offset-2 outline-none hover:opacity-80 focus-visible:shadow-[var(--focus-ring)]"
        >
          {action.label}
        </AriaButton>
      ) : null}
      {kbd ? (
        <Kbd variant="inverse" aria-hidden>
          {kbd}
        </Kbd>
      ) : null}
    </div>
  );
}
