import { type KeyboardEvent, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Button as AriaButton, Dialog as AriaDialog, DialogTrigger } from 'react-aria-components';
import { cn, Popover } from '~/ui';
import {
  addDays,
  type CalendarCell,
  formatFullDay,
  formatMonth,
  makeDate,
  monthGrid,
  parts,
  weekday,
} from './dates';

// Date field of the milestone and cycle dialogs (frames 16 and 28): a trigger showing the date and a
// popover with a Monday-first month grid, plus quick picks on the right ("In 2 weeks", "Clear").
// Arrow keys move by day and week, Page Up and Page Down by month, Home and End to the week's ends.

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
  /** Today's date: marks the day and opens the calendar on it when the field is empty. */
  today: string;
  quickPicks?: readonly QuickPick[];
  /** Trigger text when empty. */
  placeholder?: string;
  /** Trigger formatter (defaults to "Dec 12, 2026"). */
  format?: (date: string) => string;
  /** Trigger width in px; the popover keeps its own width. */
  width?: number;
  errorMessage?: string;
  isDisabled?: boolean;
  /** Text under the field when there is no error. */
  description?: string;
  /**
   * Open the calendar below the trigger, in the page flow, instead of in a popover (the milestone
   * dialog, frame 16). Esc closes it and returns focus to the trigger.
   */
  inline?: boolean;
}

const WEEKDAY_HEADERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export function DateField({
  label,
  labelNote,
  value,
  onChange,
  today,
  quickPicks,
  placeholder = 'No date',
  format = formatFullDay,
  width,
  errorMessage,
  isDisabled,
  description,
  inline = false,
}: DateFieldProps) {
  const [open, setOpen] = useState(false);
  const labelId = useId();
  const errorId = useId();
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pick = (date: string | null) => {
    onChange(date);
    setOpen(false);
    if (inline) triggerRef.current?.focus();
  };
  const trigger = (
    <AriaButton
      ref={triggerRef}
      isDisabled={isDisabled}
      aria-describedby={errorMessage ? errorId : undefined}
      aria-invalid={errorMessage ? true : undefined}
      {...(inline ? { 'aria-expanded': open, 'aria-controls': open ? panelId : undefined } : {})}
      onPress={inline ? () => setOpen(!open) : undefined}
      style={width ? { width } : undefined}
      className={cn(
        'flex h-[38px] w-full min-w-0 cursor-pointer items-center justify-between gap-2 border bg-surface px-3 text-left text-fg outline-none',
        'focus-visible:halo pressed:halo disabled:cursor-default disabled:opacity-50',
        errorMessage ? 'border-danger' : 'border-line',
      )}
    >
      <span className={cn('truncate', !value && 'text-faint')}>
        <span className="sr-only">{label}: </span>
        {value ? format(value) : placeholder}
      </span>
      <span aria-hidden className="text-[10px] text-faint">
        ▾
      </span>
    </AriaButton>
  );
  return (
    <div className="flex flex-col gap-1.5">
      <span id={labelId} aria-hidden className="text-[12px] font-semibold text-fg">
        {label}
        {labelNote ? <span className="font-normal text-faint"> {labelNote}</span> : null}
      </span>
      {inline ? (
        <>
          {trigger}
          {open ? (
            <fieldset
              id={panelId}
              aria-label={`Pick ${label.toLowerCase()}`}
              onKeyDown={(event) => {
                if (event.key !== 'Escape') return;
                // Keep the dialog around the field open.
                event.stopPropagation();
                event.preventDefault();
                setOpen(false);
                triggerRef.current?.focus();
              }}
              className="m-0 w-max min-w-0 border border-line p-0"
            >
              <CalendarPanel value={value} today={today} onPick={pick} quickPicks={quickPicks} />
            </fieldset>
          ) : null}
        </>
      ) : (
        <DialogTrigger isOpen={open} onOpenChange={setOpen}>
          {trigger}
          <Popover placement="bottom start" className="min-w-0">
            <AriaDialog aria-label={`Pick ${label.toLowerCase()}`} className="outline-none">
              <CalendarPanel value={value} today={today} onPick={pick} quickPicks={quickPicks} />
            </AriaDialog>
          </Popover>
        </DialogTrigger>
      )}
      {errorMessage ? (
        <span id={errorId} className="text-[11.5px] text-danger">
          {errorMessage}
        </span>
      ) : description ? (
        <span className="text-[11.5px] text-muted">{description}</span>
      ) : null}
    </div>
  );
}

export interface CalendarPanelProps {
  value: string | null;
  today: string;
  onPick: (date: string | null) => void;
  quickPicks?: readonly QuickPick[];
}

/** Month grid with quick picks. Focus starts on the selected day (or today). */
export function CalendarPanel({ value, today, onPick, quickPicks }: CalendarPanelProps) {
  const [focused, setFocused] = useState(value ?? today);
  const { year, month } = parts(focused);
  const weeks = monthGrid(year, month);
  const gridRef = useRef<HTMLTableElement>(null);
  const moved = useRef(false);
  const focusDay = (date: string) =>
    gridRef.current?.querySelector<HTMLElement>(`[data-date="${date}"]`)?.focus();

  // Opening focuses the selected day (or today), after the popover's own autofocus.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once on open
  useEffect(() => {
    const frame = requestAnimationFrame(() => focusDay(focused));
    return () => cancelAnimationFrame(frame);
  }, []);

  // A keyboard move focuses the new day as soon as it renders (the month may change under it), so
  // quick presses keep landing on the grid.
  // biome-ignore lint/correctness/useExhaustiveDependencies: focusDay reads the ref
  useLayoutEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    focusDay(focused);
  }, [focused]);

  const move = (date: string) => {
    moved.current = true;
    setFocused(date);
  };
  const shiftMonth = (step: number) => {
    const { day } = parts(focused);
    const last = parts(makeDate(year, month + step + 1, 0)).day;
    return makeDate(year, month + step, Math.min(day, last));
  };

  const target = (key: string): string | null => {
    const offset = (weekday(focused) + 6) % 7;
    switch (key) {
      case 'ArrowLeft':
        return addDays(focused, -1);
      case 'ArrowRight':
        return addDays(focused, 1);
      case 'ArrowUp':
        return addDays(focused, -7);
      case 'ArrowDown':
        return addDays(focused, 7);
      case 'PageUp':
        return shiftMonth(-1);
      case 'PageDown':
        return shiftMonth(1);
      case 'Home':
        return addDays(focused, -offset);
      case 'End':
        return addDays(focused, 6 - offset);
      default:
        return null;
    }
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTableElement>) => {
    const next = target(event.key);
    if (!next) return;
    event.preventDefault();
    move(next);
  };

  return (
    <div className="flex items-start gap-[18px] p-3">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-[12px] font-semibold">
          <AriaButton
            aria-label="Previous month"
            onPress={() => setFocused(shiftMonth(-1))}
            className="grid size-6 cursor-pointer place-items-center text-muted outline-none hover:text-fg focus-visible:focus-ring"
          >
            ‹
          </AriaButton>
          <span aria-live="polite">{formatMonth(year, month)}</span>
          <AriaButton
            aria-label="Next month"
            onPress={() => setFocused(shiftMonth(1))}
            className="grid size-6 cursor-pointer place-items-center text-muted outline-none hover:text-fg focus-visible:focus-ring"
          >
            ›
          </AriaButton>
        </div>
        <table
          ref={gridRef}
          aria-label={formatMonth(year, month)}
          onKeyDown={onKeyDown}
          className="border-separate border-spacing-0.5 text-center font-mono text-[10.5px]"
        >
          <thead>
            <tr>
              {WEEKDAY_HEADERS.map((day, index) => (
                <th
                  // biome-ignore lint/suspicious/noArrayIndexKey: weekday letters repeat
                  key={index}
                  scope="col"
                  className="h-[26px] w-8 p-0 text-[9.5px] font-normal text-faint"
                >
                  {day}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week) => (
              <tr key={week[0]?.date}>
                {week.map((cell) => (
                  <Day
                    key={cell.date}
                    cell={cell}
                    isSelected={cell.date === value}
                    isToday={cell.date === today}
                    isFocusTarget={cell.date === focused}
                    onPick={() => onPick(cell.date)}
                  />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {quickPicks?.length ? (
        <div className="flex flex-col gap-1.5 pt-[30px] text-[12px]">
          {quickPicks.map((quick) => (
            <AriaButton
              key={quick.label}
              onPress={() => onPick(quick.date)}
              className={cn(
                'cursor-pointer text-left outline-none hover:text-fg focus-visible:focus-ring',
                quick.date === null ? 'text-fg' : 'text-muted',
              )}
            >
              {quick.label}
            </AriaButton>
          ))}
        </div>
      ) : null}
    </div>
  );
}

interface DayProps {
  cell: CalendarCell;
  isSelected: boolean;
  isToday: boolean;
  isFocusTarget: boolean;
  onPick: () => void;
}

function Day({ cell, isSelected, isToday, isFocusTarget, onPick }: DayProps) {
  return (
    <td className="p-0">
      <button
        type="button"
        data-date={cell.date}
        tabIndex={isFocusTarget ? 0 : -1}
        aria-label={`${formatFullDay(cell.date)}${isToday ? ', today' : ''}`}
        aria-pressed={isSelected}
        aria-current={isToday ? 'date' : undefined}
        onClick={onPick}
        className={cn(
          'grid h-[26px] w-8 cursor-pointer place-items-center outline-none focus-visible:focus-ring',
          isSelected
            ? 'bg-accent text-on-accent'
            : cn(
                cell.inMonth
                  ? 'text-muted hover:bg-band hover:text-fg'
                  : 'text-faint opacity-50 hover:bg-band',
              ),
          isToday && !isSelected && 'outline outline-1 -outline-offset-1 outline-line',
        )}
      >
        {cell.day}
      </button>
    </td>
  );
}
