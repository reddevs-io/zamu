import type { ReactNode } from 'react';
import {
  Checkbox as AriaCheckbox,
  CheckboxGroup as AriaCheckboxGroup,
  type CheckboxGroupProps as AriaCheckboxGroupProps,
  type CheckboxProps as AriaCheckboxProps,
} from 'react-aria-components';
import { cn, composeTw } from './cn';
import { type FieldChromeProps, FieldDescription, FieldError, Label } from './Field';

/** The 14px box on its own; also used for read-only markers. */
export function CheckboxBox({ checked, indeterminate }: { checked: boolean; indeterminate?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid size-3.5 shrink-0 place-items-center',
        checked || indeterminate ? 'bg-accent text-on-accent' : 'border-[1.5px] border-muted',
      )}
    >
      {indeterminate ? (
        <span className="h-0.5 w-2 bg-current" />
      ) : checked ? (
        <svg viewBox="0 0 14 14" className="size-3.5" fill="none" aria-hidden>
          <path d="M3.5 7.2 5.9 9.6 10.5 4.6" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
        </svg>
      ) : null}
    </span>
  );
}

export interface CheckboxProps extends Omit<AriaCheckboxProps, 'children'> {
  children?: ReactNode;
}

export function Checkbox({ children, ...props }: CheckboxProps) {
  return (
    <AriaCheckbox
      {...props}
      className={composeTw(
        props.className,
        'group inline-flex cursor-pointer items-center gap-2 text-[12.5px] text-fg outline-none disabled:cursor-default disabled:opacity-50',
      )}
    >
      {({ isSelected, isIndeterminate, isFocusVisible }) => (
        <>
          <span className={cn('inline-flex', isFocusVisible && 'focus-ring')}>
            <CheckboxBox checked={isSelected} indeterminate={isIndeterminate} />
          </span>
          {children}
        </>
      )}
    </AriaCheckbox>
  );
}

export interface CheckboxGroupProps extends Omit<AriaCheckboxGroupProps, 'children'>, FieldChromeProps {
  children: ReactNode;
  /** Number of columns for the options (the agent project picker uses 2). */
  columns?: 1 | 2;
}

export function CheckboxGroup({
  label,
  description,
  errorMessage,
  columns = 1,
  children,
  ...props
}: CheckboxGroupProps) {
  return (
    <AriaCheckboxGroup {...props} className={composeTw(props.className, 'flex flex-col gap-2')}>
      {label ? <Label>{label}</Label> : null}
      <div className={cn('grid gap-1.5', columns === 2 && 'grid-cols-2')}>{children}</div>
      {description ? <FieldDescription>{description}</FieldDescription> : null}
      <FieldError>{errorMessage as ReactNode}</FieldError>
    </AriaCheckboxGroup>
  );
}
