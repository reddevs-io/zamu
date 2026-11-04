import { type CalendarDate, getLocalTimeZone, parseDate, today } from '@internationalized/date';
import { useState } from 'react';
import {
  Button as AriaButton,
  Calendar as AriaCalendar,
  CalendarCell,
  CalendarGrid,
  CalendarGridBody,
  CalendarGridHeader,
  CalendarHeaderCell,
  Heading,
} from 'react-aria-components';
import { cn } from './cn';

/*
 * Due-date calendar (margin.css .cal, .cal-d, .cal-top; frame 074), on React Aria Calendar: a grid of 32px
 * columns, Monday first. Today has an inset --line ring, the selected day is filled with --accent, the keyboard
 * focus is the --focus-ring, days of the next and previous month are --fg-3 at 60%. ← / → move a day,
 * ↑ / ↓ a week, Page Up / Page Down a month, Enter or Space picks.
 *
 * Values are YYYY-MM-DD strings, converted with parseDate from @internationalized/date.
 */

export interface CalendarProps {
  /** Selected day as YYYY-MM-DD, or null. */
  value: string | null;
  /** A day was picked (click, Enter or Space). */
  onChange: (value: string) => void;
  'aria-label'?: string;
  /** Move keyboard focus into the grid on mount. */
  autoFocus?: boolean;
  isDisabled?: boolean;
  className?: string;
}

/** The CalendarDate for a YYYY-MM-DD string; null for null or anything that doesn't parse. */
function toDate(value: string | null): CalendarDate | null {
  if (!value) return null;
  try {
    return parseDate(value);
  } catch {
    return null;
  }
}

export function Calendar({ value, onChange, autoFocus, isDisabled, className, ...props }: CalendarProps) {
  const selected = toDate(value);
  // The shown month follows the arrow keys, and jumps to a new value set from outside (a quick pick, a
  // typed date).
  const [focused, setFocused] = useState<CalendarDate>(() => selected ?? today(getLocalTimeZone()));
  const [shownValue, setShownValue] = useState(value);
  if (value !== shownValue) {
    setShownValue(value);
    if (selected) setFocused(selected);
  }
  return (
    <AriaCalendar
      aria-label={props['aria-label'] ?? 'Due date'}
      firstDayOfWeek="mon"
      autoFocus={autoFocus}
      isDisabled={isDisabled}
      value={selected}
      focusedValue={focused}
      onFocusChange={setFocused}
      onChange={(date) => {
        if (date) onChange(date.toString());
      }}
      className={cn('flex w-max flex-col text-sm text-fg', className)}
    >
      <header className="flex items-center gap-2 px-2.5 pt-1.5 pb-0.5">
        <Heading className="m-0 flex-1 text-sm font-semibold" />
        <CalendarNavButton slot="previous" label="Previous month">
          ‹
        </CalendarNavButton>
        <CalendarNavButton slot="next" label="Next month">
          ›
        </CalendarNavButton>
      </header>
      <CalendarGrid weekdayStyle="short" className="mx-1.5 mt-1 mb-1.5 border-separate border-spacing-0.5">
        <CalendarGridHeader>
          {(day) => (
            <CalendarHeaderCell className="h-6 w-8 p-0 text-xs font-normal text-fg-3">
              {day.slice(0, 2)}
            </CalendarHeaderCell>
          )}
        </CalendarGridHeader>
        <CalendarGridBody>
          {(date) => (
            <CalendarCell
              date={date}
              className={({
                isSelected,
                isFocusVisible,
                isOutsideMonth,
                isToday,
                isHovered,
                isDisabled: off,
              }) =>
                cn(
                  'grid h-7.5 w-8 cursor-pointer place-items-center rounded-sm text-sm tabular-nums outline-none',
                  isOutsideMonth && 'text-fg-3 opacity-60',
                  isHovered && !isSelected && 'bg-bg-lane',
                  isToday && !isSelected && 'font-semibold shadow-[inset_0_0_0_1.5px_var(--line)]',
                  isSelected && 'bg-accent font-semibold text-accent-ink opacity-100',
                  isFocusVisible && 'shadow-[var(--focus-ring)]',
                  off && 'cursor-default opacity-45',
                )
              }
            />
          )}
        </CalendarGridBody>
      </CalendarGrid>
    </AriaCalendar>
  );
}

function CalendarNavButton({
  slot,
  label,
  children,
}: {
  slot: 'previous' | 'next';
  label: string;
  children: string;
}) {
  return (
    <AriaButton
      slot={slot}
      aria-label={label}
      className="grid size-6.5 cursor-pointer place-items-center rounded-md text-md text-fg-2 outline-none hover:bg-bg-lane hover:text-fg focus-visible:shadow-[var(--focus-ring)] disabled:opacity-45"
    >
      <span aria-hidden>{children}</span>
    </AriaButton>
  );
}
