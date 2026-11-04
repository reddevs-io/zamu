import type { ReactNode } from 'react';
import {
  Radio as AriaRadio,
  RadioGroup as AriaRadioGroup,
  type RadioGroupProps as AriaRadioGroupProps,
  type RadioProps as RadioProps_,
} from 'react-aria-components';
import { cn, composeTw } from './cn';
import { type FieldChromeProps, FieldDescription, FieldError, Label } from './Field';

export function RadioDot({ selected }: { selected: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'block size-3.5 shrink-0 rounded-full',
        // 1.5px ring: Margin's control stroke, finer than the border-2 step.
        selected ? 'border-4 border-accent' : 'border-[1.5px] border-fg-3',
      )}
    />
  );
}

export interface RadioGroupProps extends Omit<AriaRadioGroupProps, 'children'>, FieldChromeProps {
  children: ReactNode;
  /** `stack`: one card per row. `grid`: two cards side by side (Permission). */
  layout?: 'stack' | 'grid';
}

/** Radio options drawn as bordered cards; the selected card gets the accent border on --accent-soft. */
export function RadioGroup({
  label,
  description,
  errorMessage,
  layout = 'stack',
  children,
  ...props
}: RadioGroupProps) {
  return (
    <AriaRadioGroup {...props} className={composeTw(props.className, 'flex flex-col gap-2')}>
      {label ? <Label>{label}</Label> : null}
      <div className={cn('grid gap-1.5', layout === 'grid' && 'grid-cols-2')}>{children}</div>
      {description ? <FieldDescription>{description}</FieldDescription> : null}
      <FieldError>{errorMessage as ReactNode}</FieldError>
    </AriaRadioGroup>
  );
}

export interface RadioCardProps extends Omit<RadioProps_, 'children'> {
  label: ReactNode;
  description?: ReactNode;
}

export function RadioCard({ label, description, ...props }: RadioCardProps) {
  return (
    <AriaRadio
      {...props}
      className={composeTw(props.className, ({ isSelected, isFocusVisible }) =>
        cn(
          'flex cursor-pointer gap-2.5 rounded-md border px-3 py-2.25 outline-none disabled:cursor-default disabled:opacity-50',
          description ? 'items-start' : 'items-center',
          isSelected ? 'border-accent bg-accent-soft' : 'border-line hover:bg-bg-grp',
          isFocusVisible && 'focus-ring',
        ),
      )}
    >
      {({ isSelected }) => (
        <>
          <span className={description ? 'mt-0.5' : undefined}>
            <RadioDot selected={isSelected} />
          </span>
          <span className="min-w-0">
            <span className="block">{label}</span>
            {description ? <span className="mt-px block text-xs text-fg-2">{description}</span> : null}
          </span>
        </>
      )}
    </AriaRadio>
  );
}

export interface RadioProps extends Omit<RadioProps_, 'children'> {
  children: ReactNode;
}

/** Plain inline radio (dot and label) for compact lists. */
export function Radio({ children, ...props }: RadioProps) {
  return (
    <AriaRadio
      {...props}
      className={composeTw(props.className, ({ isFocusVisible }) =>
        cn(
          'inline-flex cursor-pointer items-center gap-2 text-sm outline-none disabled:cursor-default disabled:opacity-50',
          isFocusVisible && 'focus-ring',
        ),
      )}
    >
      {({ isSelected }) => (
        <>
          <RadioDot selected={isSelected} />
          {children}
        </>
      )}
    </AriaRadio>
  );
}
