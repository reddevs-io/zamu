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

export const inputBase = cn(
  'w-full min-w-0 border border-line bg-surface px-3 text-fg outline-none',
  'placeholder:text-faint disabled:opacity-50',
  'invalid:border-danger focus:halo',
);

export function Label({ className, ...props }: LabelProps) {
  return <AriaLabel {...props} className={cn('text-[12px] font-semibold text-fg', className)} />;
}

export function FieldDescription({ className, ...props }: TextProps) {
  return <Text {...props} slot="description" className={cn('text-[11.5px] text-muted', className)} />;
}

export function FieldError({ className, ...props }: FieldErrorProps) {
  return <AriaFieldError {...props} className={composeTw(className, 'text-[11.5px] text-danger')} />;
}

/** Label, control, then description or error, stacked with a 6px gap. */
export interface FieldChromeProps {
  label?: ReactNode;
  description?: ReactNode;
  errorMessage?: ReactNode | ((validation: { validationErrors: string[] }) => ReactNode);
}

export const fieldStack = 'flex flex-col gap-1.5';
