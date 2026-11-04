import { composeRenderProps } from 'react-aria-components';
import { extendTailwindMerge } from 'tailwind-merge';
import { createTV } from 'tailwind-variants';

export type { VariantProps } from 'tailwind-variants';

/*
 * tailwind-merge has to know the Margin scales from app.css, or it treats `text-md` as a colour, keeps both
 * `rounded-sm` and `rounded-pill`, and drops `shadow-pop` next to a shadow colour. The names match the
 * `@theme inline reference` block in app.css.
 */
const twMergeConfig = {
  extend: {
    theme: {
      text: ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl'],
      leading: ['tight', 'ui', 'prose'],
      radius: ['sm', 'md', 'lg', 'pill'],
      shadow: ['card', 'pop', 'lift'],
      font: ['sans', 'serif', 'mono'],
    },
  },
};

const twMerge = extendTailwindMerge(twMergeConfig);

/** tailwind-variants with the same merge config as `cn`. */
export const tv = createTV({ twMergeConfig });

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
