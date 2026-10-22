import { composeRenderProps } from 'react-aria-components';
import { twMerge } from 'tailwind-merge';

export { tv, type VariantProps } from 'tailwind-variants';

type ClassValue = string | false | null | undefined | 0;

/** Joins class names and resolves Tailwind conflicts (last one wins). */
export function cn(...classes: ClassValue[]): string {
  return twMerge(classes.filter(Boolean).join(' '));
}

type RenderClassName<T> = string | ((values: T & { defaultClassName: string | undefined }) => string);

/**
 * Merges a component's base classes with a React Aria `className`, which may be a string or a function
 * of the component's render props. `base` may itself depend on the render props.
 */
export function composeTw<T>(
  className: RenderClassName<T> | undefined,
  base: string | ((values: T & { defaultClassName: string | undefined }) => string),
): (values: T & { defaultClassName: string | undefined }) => string {
  return composeRenderProps(className, (resolved, values) =>
    twMerge(typeof base === 'function' ? base(values) : base, resolved),
  );
}
