import type { ReactNode } from 'react';
import {
  Tooltip as AriaTooltip,
  type TooltipProps as AriaTooltipProps,
  TooltipTrigger as AriaTooltipTrigger,
  type TooltipTriggerComponentProps,
} from 'react-aria-components';
import { composeTw } from './cn';
import { Kbd } from './Kbd';

/** Hover or focus trigger; opens after 500 ms. */
export function TooltipTrigger({ delay = 500, ...props }: TooltipTriggerComponentProps) {
  return <AriaTooltipTrigger delay={delay} {...props} />;
}

export interface TooltipProps extends Omit<AriaTooltipProps, 'children'> {
  children?: ReactNode;
  /** Key hint after the label: "I" for Assign to me, "⇧D" for Due date. */
  kbd?: string;
}

/**
 * Margin tooltip (margin.css .tip): --fg chip with --bg text, 28px, text-xs 500, an optional key hint. Used for
 * icon buttons, truncated names and locked fields ("Comes from the file").
 */
export function Tooltip({ offset = 6, kbd, children, ...props }: TooltipProps) {
  return (
    <AriaTooltip
      offset={offset}
      {...props}
      className={composeTw(
        props.className,
        'flex max-w-80 min-h-7 items-center gap-2 rounded-sm bg-fg py-1 pr-2 pl-2.5 text-xs leading-snug font-medium text-bg',
      )}
    >
      {children}
      {kbd ? (
        <Kbd variant="inverse" aria-hidden>
          {kbd}
        </Kbd>
      ) : null}
    </AriaTooltip>
  );
}

/** The tooltip's chip drawn in place (no trigger), for galleries and static frames. */
export function TooltipChip({ children, kbd }: { children: ReactNode; kbd?: string }) {
  return (
    <span className="inline-flex h-7 items-center gap-2 rounded-sm bg-fg pr-2 pl-2.5 text-xs font-medium whitespace-nowrap text-bg">
      {children}
      {kbd ? (
        <Kbd variant="inverse" aria-hidden>
          {kbd}
        </Kbd>
      ) : null}
    </span>
  );
}
