import type { ReactNode } from 'react';
import { Switch as AriaSwitch, type SwitchProps as AriaSwitchProps } from 'react-aria-components';
import { cn, composeTw } from './cn';

export interface SwitchProps extends Omit<AriaSwitchProps, 'children'> {
  children?: ReactNode;
}

/** Margin toggle (margin.css .tgl): 30×18 pill, --line off, --accent on ("Create more", display options). */
export function Switch({ children, ...props }: SwitchProps) {
  return (
    <AriaSwitch
      {...props}
      className={composeTw(
        props.className,
        'inline-flex cursor-pointer items-center gap-2 text-sm text-fg-2 outline-none disabled:cursor-default disabled:opacity-45',
      )}
    >
      {({ isSelected, isFocusVisible }) => (
        <>
          <span
            aria-hidden
            data-on={isSelected || undefined}
            className={cn(
              'relative block h-4.5 w-7.5 shrink-0 rounded-pill transition-colors',
              isSelected ? 'bg-accent' : 'bg-line',
              isFocusVisible && 'shadow-[var(--focus-ring)]',
            )}
          >
            <span
              className={cn(
                'absolute top-0.5 size-3.5 rounded-full shadow-card transition-[left]',
                isSelected ? 'left-3.5 bg-accent-ink' : 'left-0.5 bg-surface-pop',
              )}
            />
          </span>
          {children}
        </>
      )}
    </AriaSwitch>
  );
}
