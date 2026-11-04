import type { ReactNode } from 'react';
import { Button as AriaButton, type ButtonProps as AriaButtonProps } from 'react-aria-components';
import { composeTw } from './cn';
import { Kbd } from './Kbd';
import { Tooltip, TooltipTrigger } from './Tooltip';

/*
 * Pieces for fields and actions that Backlog.md owns while a project mirrors. The hatch never stands
 * alone: pair it with a sentence that says the value comes from Backlog.md.
 */

/** Tailwind utility class for the diagonal hatch ground (defined in styles/app.css). */
export const lockedHatch = 'locked-hatch';

export interface DisabledCreateButtonProps extends Omit<AriaButtonProps, 'children' | 'isDisabled'> {
  /** Defaults to "New". */
  children?: ReactNode;
  /** Shortcut hint drawn at 60% opacity. Defaults to "C". */
  kbd?: string;
  /**
   * Why creating is off, shown on hover and focus. Wrap file paths and commands in <code>: they render as
   * inline code on the inverted tooltip.
   */
  tooltip: ReactNode;
  /** Controlled tooltip, for the gallery and tests. */
  isTooltipOpen?: boolean;
  onTooltipOpenChange?: (isOpen: boolean) => void;
}

/**
 * Dashed, faint "New" for a mirrored project. It stays focusable (aria-disabled, not disabled) so keyboard
 * and pointer users can reach the tooltip that explains why. `onPress` may show the same text as a toast.
 */
export function DisabledCreateButton({
  children = 'New',
  kbd = 'C',
  tooltip,
  isTooltipOpen,
  onTooltipOpenChange,
  ...props
}: DisabledCreateButtonProps) {
  return (
    <TooltipTrigger isOpen={isTooltipOpen} onOpenChange={onTooltipOpenChange}>
      <AriaButton
        {...props}
        aria-disabled="true"
        className={composeTw(
          props.className,
          'box-border inline-flex h-8 shrink-0 cursor-default items-center justify-center gap-2 rounded-md border border-dashed border-line bg-transparent px-3 font-semibold whitespace-nowrap text-fg-3 outline-none select-none focus-visible:focus-ring',
        )}
      >
        {children}
        {kbd ? (
          <Kbd aria-hidden className="opacity-60">
            {kbd}
          </Kbd>
        ) : null}
      </AriaButton>
      {/* The code ground is a neutral that reads on the inverted tooltip in both themes. */}
      <Tooltip
        placement="bottom end"
        className="w-85 max-w-85 px-3 py-2.5 text-sm leading-normal shadow-lift [&_code]:bg-[oklch(0.5_0_0/0.35)] [&_code]:px-1 [&_code]:py-px [&_code]:font-mono [&_code]:text-xs"
      >
        {tooltip}
      </Tooltip>
    </TooltipTrigger>
  );
}
