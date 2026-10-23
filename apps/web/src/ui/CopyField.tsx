import { type ReactNode, useId, useState } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { useCopy } from './CodeBlock';
import { cn } from './cn';

export interface CopyFieldProps {
  /** Caption above the box: "URL", "Secret token". */
  label?: ReactNode;
  /**
   * The value to show and copy. Leave it out when the viewer may not see it (a member looking at the
   * webhook secret): only `maskedValue` shows, without buttons.
   */
  value?: string;
  /**
   * Masked form, for secrets: "whsec_9Lq2……Tz4". When set, the field starts masked and gets a Show button;
   * Copy always copies `value`.
   */
  maskedValue?: string;
  /** Controlled reveal state for secrets. */
  isRevealed?: boolean;
  onRevealChange?: (isRevealed: boolean) => void;
  /** Called after a successful copy. */
  onCopy?: () => void;
  className?: string;
}

const button =
  'box-border inline-flex h-[34px] shrink-0 cursor-pointer items-center gap-1.5 border border-line bg-surface px-3 font-medium text-fg outline-none hover:bg-band focus-visible:focus-ring-inset';

/**
 * Read-only value with Copy, and Show for secrets (ledger-m3.css .m3-copy): webhook URL and secret. The box
 * is --band with a mono 11px value cut at the end; the full value is selectable.
 */
export function CopyField({
  label,
  value,
  maskedValue,
  isRevealed: revealedProp,
  onRevealChange,
  onCopy,
  className,
}: CopyFieldProps) {
  const labelId = useId();
  const [revealedState, setRevealedState] = useState(false);
  const isRevealed = revealedProp ?? revealedState;
  const setRevealed = (next: boolean) => {
    setRevealedState(next);
    onRevealChange?.(next);
  };
  const { copied, copy } = useCopy();
  const isSecret = maskedValue != null;
  const shown = isSecret && (!isRevealed || value == null) ? maskedValue : (value ?? '');
  const canAct = value != null;
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      {label ? (
        <span id={labelId} className="text-[12px] font-semibold text-fg">
          {label}
        </span>
      ) : null}
      <fieldset
        aria-labelledby={label ? labelId : undefined}
        className="m-0 flex min-w-0 items-stretch border-0 p-0"
      >
        <span
          data-masked={isSecret && shown === maskedValue ? true : undefined}
          className={cn(
            'box-border flex h-[34px] min-w-0 flex-1 items-center border border-line bg-band px-2.5 font-mono text-[11px] whitespace-nowrap text-fg',
            canAct && 'border-r-0',
          )}
        >
          <span className={cn('min-w-0 truncate', !(isSecret && shown === maskedValue) && 'select-all')}>
            {shown}
          </span>
        </span>
        {canAct && isSecret ? (
          <AriaButton className={button} onPress={() => setRevealed(!isRevealed)}>
            {isRevealed ? 'Hide' : 'Show'}
          </AriaButton>
        ) : null}
        {canAct ? (
          <AriaButton
            className={cn(button, isSecret && 'border-l-0')}
            onPress={async () => {
              if (await copy(value)) onCopy?.();
            }}
          >
            {copied ? 'Copied' : 'Copy'}
          </AriaButton>
        ) : null}
      </fieldset>
    </div>
  );
}
