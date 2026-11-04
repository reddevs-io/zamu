import { useId, useRef, useState } from 'react';
import { Button as AriaButton, Dialog as AriaDialog, DialogTrigger } from 'react-aria-components';
import { Calendar, CaretGlyph, cn, Popover } from '~/ui';
import { formatFullDay } from './dates';

// Date field of the milestone and cycle dialogs: a field-sized button with the date, and a popover with
// the kit Calendar (Monday first; arrows move a day or a week, Page Up and Page Down a month, Enter
// picks) plus quick picks on the right ("In 2 weeks", "End of month", "Clear").

export interface QuickPick {
  label: string;
  /** null clears the field. */
  date: string | null;
}

export interface DateFieldProps {
  label: string;
  /** Muted text after the label: "optional". */
  labelNote?: string;
  value: string | null;
  onChange: (value: string | null) => void;
  quickPicks?: readonly QuickPick[];
  /** Trigger text when empty. */
  placeholder?: string;
  /** Trigger formatter (defaults to "Dec 12, 2026"). */
  format?: (date: string) => string;
  /** Trigger width in px. */
  width?: number;
  errorMessage?: string;
  isDisabled?: boolean;
  /** Text under the field when there is no error. */
  description?: string;
}

export function DateField({
  label,
  labelNote,
  value,
  onChange,
  quickPicks,
  placeholder = 'No date',
  format = formatFullDay,
  width,
  errorMessage,
  isDisabled,
  description,
}: DateFieldProps) {
  const [open, setOpen] = useState(false);
  const errorId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pick = (date: string | null) => {
    onChange(date);
    setOpen(false);
  };
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span aria-hidden className="text-sm font-medium text-fg-2">
        {label}
        {labelNote ? <span className="font-normal text-fg-3"> {labelNote}</span> : null}
      </span>
      <DialogTrigger isOpen={open} onOpenChange={setOpen}>
        <AriaButton
          ref={triggerRef}
          isDisabled={isDisabled}
          aria-describedby={errorMessage ? errorId : undefined}
          aria-invalid={errorMessage ? true : undefined}
          style={width ? { width } : undefined}
          className={cn(
            'flex h-9 w-full min-w-0 cursor-pointer items-center justify-between gap-2 rounded-sm border bg-surface px-2.75 text-left text-md text-fg outline-none',
            'focus-visible:border-accent focus-visible:shadow-[0_0_0_3px_var(--accent-soft)] pressed:border-accent disabled:cursor-default disabled:bg-bg-lane disabled:opacity-55',
            errorMessage ? 'border-danger shadow-[0_0_0_3px_var(--danger-soft)]' : 'border-line',
          )}
        >
          <span className={cn('truncate', !value && 'text-fg-3')}>
            <span className="sr-only">{label}: </span>
            {value ? format(value) : placeholder}
          </span>
          <CaretGlyph />
        </AriaButton>
        <Popover placement="bottom start" className="min-w-0">
          <AriaDialog aria-label={`Pick ${label.toLowerCase()}`} className="outline-none">
            <div className="flex items-start gap-1 p-1.5">
              <Calendar aria-label={label} value={value} onChange={(date) => pick(date)} autoFocus />
              {quickPicks?.length ? (
                <div className="flex flex-col gap-0.5 border-l border-line-soft pt-1 pl-1.5">
                  {quickPicks.map((quick) => (
                    <AriaButton
                      key={quick.label}
                      onPress={() => pick(quick.date)}
                      className={cn(
                        'h-7 cursor-pointer rounded-sm px-2 text-left text-sm whitespace-nowrap outline-none hover:bg-bg-lane hover:text-fg focus-visible:shadow-[var(--focus-ring)]',
                        quick.date === null ? 'text-fg-3' : 'text-fg-2',
                      )}
                    >
                      {quick.label}
                    </AriaButton>
                  ))}
                </div>
              ) : null}
            </div>
          </AriaDialog>
        </Popover>
      </DialogTrigger>
      {errorMessage ? (
        <span id={errorId} className="text-xs font-medium text-danger">
          {errorMessage}
        </span>
      ) : description ? (
        <span className="text-xs text-fg-3">{description}</span>
      ) : null}
    </div>
  );
}
