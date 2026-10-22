import type { ReactNode } from 'react';
import { Button as AriaButton, type ButtonProps as AriaButtonProps } from 'react-aria-components';
import { composeTw, tv, type VariantProps } from './cn';
import { Kbd } from './Kbd';

export const buttonStyles = tv({
  base: [
    'relative inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap select-none',
    'outline-none focus-visible:focus-ring disabled:cursor-default disabled:opacity-50',
  ],
  variants: {
    variant: {
      /** Filled with --fg: the main action on a screen. */
      primary: 'bg-fg font-semibold text-bg hover:bg-[color-mix(in_oklch,var(--fg)_86%,var(--bg))]',
      /** Cobalt fill: Copy, and accent actions. */
      accent:
        'bg-accent font-semibold text-on-accent hover:bg-[color-mix(in_oklch,var(--accent)_86%,var(--fg))]',
      /** Hairline border on surface: Cancel, Retry, Invite person. */
      secondary: 'border border-line bg-surface font-medium text-fg hover:bg-band pressed:bg-band',
      /** Danger text with hairline border: Revoke. */
      destructive:
        'border border-line bg-transparent font-medium text-danger hover:border-danger hover:bg-danger-bg',
      /** Text-only button: Open as page, row menus. */
      ghost: 'bg-transparent font-medium text-muted hover:text-fg',
    },
    size: {
      sm: 'h-7 px-2.5 text-[12px]',
      md: 'h-8 px-3',
      lg: 'h-[38px] px-3.5',
    },
    fullWidth: { true: 'w-full' },
    iconOnly: { true: 'aspect-square px-0' },
  },
  defaultVariants: { variant: 'primary', size: 'md' },
});

type ButtonStyleProps = VariantProps<typeof buttonStyles>;

export interface ButtonProps extends Omit<AriaButtonProps, 'children'> {
  variant?: ButtonStyleProps['variant'];
  /** Defaults to `md` (32px), or `sm` (28px) for `destructive`. */
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
  const kbdVariant = variant === 'primary' || variant === 'accent' ? 'inverse' : 'default';
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
            <span aria-hidden className="size-2 shrink-0 bg-current motion-safe:animate-pulse" />
          ) : null}
          {children}
          {kbd ? (
            <Kbd variant={kbdVariant} aria-hidden>
              {kbd}
            </Kbd>
          ) : null}
        </>
      )}
    </AriaButton>
  );
}
