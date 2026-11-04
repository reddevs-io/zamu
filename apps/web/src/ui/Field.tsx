import type { ReactNode } from 'react';
import {
  FieldError as AriaFieldError,
  Label as AriaLabel,
  type FieldErrorProps,
  type LabelProps,
  Text,
  type TextProps,
} from 'react-aria-components';
import { cn, composeTw } from './cn';

/*
 * Margin form chrome (screens.css .field, .flabel, .input, .help). Inputs are 36px, radius sm, a --line border
 * on --surface. Keyboard focus: --accent border with a 3px --accent-soft halo. Error: --danger border with a
 * --danger-soft halo. Disabled: 55% on --bg-lane. Read-only (mirrored): --bg-lane, no border, --fg-2 text.
 */
export const inputBase = cn(
  'w-full min-w-0 rounded-sm border border-line bg-surface px-2.75 text-md text-fg outline-none',
  'placeholder:text-fg-3',
  'focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)]',
  'invalid:border-danger invalid:shadow-[0_0_0_3px_var(--danger-soft)]',
  'disabled:bg-bg-lane disabled:opacity-55',
  // [readonly], not :read-only, which also matches buttons (the Select trigger shares these classes).
  '[&[readonly]]:border-transparent [&[readonly]]:bg-bg-lane [&[readonly]]:text-fg-2 [&[readonly]]:shadow-none',
);

export function Label({ className, ...props }: LabelProps) {
  return <AriaLabel {...props} className={cn('text-sm font-medium text-fg-2', className)} />;
}

export function FieldDescription({ className, ...props }: TextProps) {
  return <Text {...props} slot="description" className={cn('text-xs text-fg-3', className)} />;
}

export function FieldError({ className, ...props }: FieldErrorProps) {
  return <AriaFieldError {...props} className={composeTw(className, 'text-xs font-medium text-danger')} />;
}

/** Label, control, then description or error, stacked with a 6px gap. */
export interface FieldChromeProps {
  label?: ReactNode;
  description?: ReactNode;
  errorMessage?: ReactNode | ((validation: { validationErrors: string[] }) => ReactNode);
}

export const fieldStack = 'flex flex-col gap-1.5';
