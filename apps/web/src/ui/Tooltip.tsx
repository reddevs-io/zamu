import {
  Tooltip as AriaTooltip,
  TooltipTrigger as AriaTooltipTrigger,
  type TooltipProps,
  type TooltipTriggerComponentProps,
} from 'react-aria-components';
import { composeTw } from './cn';

/** Hover or focus trigger; opens after 500 ms. */
export function TooltipTrigger({ delay = 500, ...props }: TooltipTriggerComponentProps) {
  return <AriaTooltipTrigger delay={delay} {...props} />;
}

/** Inverted chip (fg on bg) used for truncated names and icon buttons. */
export function Tooltip({ offset = 6, ...props }: TooltipProps) {
  return (
    <AriaTooltip
      offset={offset}
      {...props}
      className={composeTw(props.className, 'max-w-80 bg-fg px-2 py-1 text-[11.5px] leading-snug text-bg')}
    />
  );
}
