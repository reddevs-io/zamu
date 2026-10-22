import type { ReactNode } from 'react';
import { Switch as AriaSwitch, type SwitchProps as AriaSwitchProps } from 'react-aria-components';
import { cn, composeTw } from './cn';

export interface SwitchProps extends Omit<AriaSwitchProps, 'children'> {
  children?: ReactNode;
}

/** Square 26×14 toggle ("Create more"). */
export function Switch({ children, ...props }: SwitchProps) {
  return (
    <AriaSwitch
      {...props}
      className={composeTw(
        props.className,
        'inline-flex cursor-pointer items-center gap-2 text-[12.5px] text-muted outline-none disabled:cursor-default disabled:opacity-50',
      )}
    >
      {({ isSelected, isFocusVisible }) => (
        <>
          <span
            aria-hidden
            className={cn(
              'relative block h-3.5 w-[26px] shrink-0 transition-colors',
              isSelected ? 'bg-accent' : 'bg-line',
              isFocusVisible && 'focus-ring',
            )}
          >
            <span
              className={cn(
                'absolute top-0.5 size-2.5 transition-[left]',
                isSelected ? 'left-[14px] bg-on-accent' : 'left-0.5 bg-surface',
              )}
            />
          </span>
          {children}
        </>
      )}
    </AriaSwitch>
  );
}
