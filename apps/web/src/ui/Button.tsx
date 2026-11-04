import type { ReactNode } from 'react';
import { Button as AriaButton, type ButtonProps as AriaButtonProps } from 'react-aria-components';
import { composeTw, tv, type VariantProps } from './cn';
import { Kbd } from './Kbd';

/*
 * Margin buttons (margin.css .btn): 30px, radius md, text-sm 500. Hover, pressed, keyboard focus (the
 * --focus-ring double ring) and disabled (45%) come from React Aria's data attributes. The hover fills mix the
 * fill with --fg as in margin.css (no token holds them); the focus ring reads --focus-ring.
 */
export const buttonStyles = tv({
  base: [
    'relative inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-transparent whitespace-nowrap select-none',
    'text-sm font-medium outline-none focus-visible:shadow-[var(--focus-ring)]',
    'disabled:cursor-default disabled:opacity-45',
  ],
  variants: {
    variant: {
      /** Accent fill: the main action of a screen or dialog (New task, Create task). */
      primary:
        'bg-accent font-semibold text-accent-ink hover:bg-[color-mix(in_oklch,var(--accent)_88%,var(--fg))] pressed:bg-[color-mix(in_oklch,var(--accent)_82%,var(--fg))]',
      /** Same as primary. Kept for screens that still ask for it (sign-in). */
      accent:
        'bg-accent font-semibold text-accent-ink hover:bg-[color-mix(in_oklch,var(--accent)_88%,var(--fg))] pressed:bg-[color-mix(in_oklch,var(--accent)_82%,var(--fg))]',
      /** Outlined (design "secondary"): Copy link, Cancel, Try again. */
      secondary: 'border-line text-fg-2 hover:bg-bg-lane hover:text-fg pressed:bg-bg-lane',
      /** No border, lane background on hover (design "quiet"): Filter, Display, toolbar actions. */
      quiet: 'text-fg-2 hover:bg-bg-lane hover:text-fg pressed:bg-bg-lane',
      /** Danger fill (design "danger"): the confirm button of a destructive dialog. */
      danger:
        'bg-danger font-semibold text-accent-ink hover:bg-[color-mix(in_oklch,var(--danger)_88%,var(--fg))] pressed:bg-[color-mix(in_oklch,var(--danger)_82%,var(--fg))]',
      /** Outlined danger text: Revoke, Remove, row actions that destroy something. */
      destructive: 'border-line text-danger hover:border-danger hover:bg-danger-soft',
      /** Text only, no padding change on hover: inline actions (Clear, Open as page, Select all). */
      ghost: 'text-fg-2 hover:text-fg',
    },
    size: {
      /** 26px, text-xs. */
      sm: 'h-6.5 px-2.25 text-xs',
      /** 30px. */
      md: 'h-7.5 px-2.75',
      /** 38px: full-width form buttons (sign-in). */
      lg: 'h-9.5 px-3.5',
    },
    fullWidth: { true: 'w-full' },
    iconOnly: { true: 'aspect-square px-0' },
  },
  defaultVariants: { variant: 'primary', size: 'md' },
});

type ButtonStyleProps = VariantProps<typeof buttonStyles>;

export interface ButtonProps extends Omit<AriaButtonProps, 'children'> {
  variant?: ButtonStyleProps['variant'];
  /** Defaults to `md` (30px), or `sm` (26px) for `destructive`. */
  size?: ButtonStyleProps['size'];
  fullWidth?: boolean;
  iconOnly?: boolean;
  /** Keyboard hint drawn inside the button, for example "C" or "⌘↵". Also set aria-keyshortcuts. */
  kbd?: string;
  children?: ReactNode;
}

export function Button({
  variant = 'primary',
  size,
  fullWidth,
  iconOnly,
  kbd,
  children,
  ...props
}: ButtonProps) {
  const resolvedSize = size ?? (variant === 'destructive' ? 'sm' : 'md');
  const filled = variant === 'primary' || variant === 'accent' || variant === 'danger';
  return (
    <AriaButton
      {...props}
      className={composeTw(
        props.className,
        buttonStyles({ variant, size: resolvedSize, fullWidth, iconOnly }),
      )}
    >
      {({ isPending }) => (
        <>
          {isPending ? (
            <span aria-hidden className="size-2 shrink-0 rounded-full bg-current motion-safe:animate-pulse" />
          ) : null}
          {children}
          {kbd ? (
            <Kbd variant={filled ? 'inverse' : 'default'} aria-hidden>
              {kbd}
            </Kbd>
          ) : null}
        </>
      )}
    </AriaButton>
  );
}
