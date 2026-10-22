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
        selected ? 'border-4 border-accent' : 'border-[1.5px] border-muted',
      )}
    />
  );
}

export interface RadioGroupProps extends Omit<AriaRadioGroupProps, 'children'>, FieldChromeProps {
  children: ReactNode;
  /** `stack`: one card per row. `grid`: two cards side by side (Permission). */
  layout?: 'stack' | 'grid';
}

/** Radio options drawn as bordered cards; the selected card gets the accent border and --sel fill. */
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
          'flex cursor-pointer gap-2.5 border px-3 py-[9px] outline-none disabled:cursor-default disabled:opacity-50',
          description ? 'items-start' : 'items-center',
          isSelected ? 'border-accent bg-sel' : 'border-line hover:bg-band',
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
            {description ? <span className="mt-px block text-[11.5px] text-muted">{description}</span> : null}
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
          'inline-flex cursor-pointer items-center gap-2 text-[12.5px] outline-none disabled:cursor-default disabled:opacity-50',
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
