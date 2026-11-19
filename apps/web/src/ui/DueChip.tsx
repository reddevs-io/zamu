import { type DueState, dueState, type TaskStatus } from '@zamu/contracts';
import { cn } from './cn';

/*
 * Margin due chip (margin.css .due): text-xs, no background. future "Nov 14" in --fg-2; soon "Tomorrow",
 * "In 2 days" and today "Today" in --fg 500; overdue "3 days overdue" in --danger 600; done (a Done or
 * Canceled task with a date) "Oct 2 · done" in --fg-3. The state comes from dueState() in @zamu/contracts.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

function parts(date: string): [number, number, number] {
  const [year = '0', month = '1', day = '1'] = date.split('-');
  return [Number(year), Number(month), Number(day)];
}

/** Whole days from `from` to `to` (YYYY-MM-DD), negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = parts(from);
  const [ty, tm, td] = parts(to);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

/** "Nov 14", or "Nov 14, 2027" when the year differs from `today`'s. */
export function formatShortDate(date: string, today?: string): string {
  const [year, month, day] = parts(date);
  const base = `${MONTHS[month - 1] ?? ''} ${day}`;
  return today && parts(today)[0] !== year ? `${base}, ${year}` : base;
}

/** Today in the browser's time zone as YYYY-MM-DD. Screens pass the server's day when they have it. */
export function localToday(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/** The chip's words for a due date in a given state. */
export function dueText(dueDate: string, state: DueState, today: string): string {
  switch (state) {
    case 'today':
      return 'Today';
    case 'soon': {
      const days = daysBetween(today, dueDate);
      return days === 1 ? 'Tomorrow' : `In ${days} days`;
    }
    case 'overdue': {
      const days = daysBetween(dueDate, today);
      return days === 1 ? '1 day overdue' : `${days} days overdue`;
    }
    case 'done':
      return `${formatShortDate(dueDate, today)} · done`;
    default:
      return formatShortDate(dueDate, today);
  }
}

const TONE: Record<DueState, string> = {
  none: 'text-fg-3',
  future: 'text-fg-2',
  soon: 'font-medium text-fg',
  today: 'font-medium text-fg',
  overdue: 'font-semibold text-danger',
  done: 'text-fg-3',
};

export interface DueChipProps {
  /** YYYY-MM-DD, or null for no date (renders nothing unless `placeholder` is set). */
  dueDate: string | null;
  status: TaskStatus;
  /** Today as YYYY-MM-DD in APP_TIME_ZONE. Defaults to the browser's day. */
  today?: string;
  /** Add the date after relative words, as the task view does: "3 days overdue  Oct 31". */
  withDate?: boolean;
  /** Text when there is no date ("Set due date"); nothing by default. */
  placeholder?: string;
  className?: string;
}

/** Due date on cards, rows and the task view. Carries `data-due` with the state for tests and styling. */
export function DueChip({
  dueDate,
  status,
  today = localToday(),
  withDate = false,
  placeholder,
  className,
}: DueChipProps) {
  const state = dueState(dueDate, status, today);
  if (dueDate === null) {
    return placeholder ? (
      <span
        data-due="none"
        className={cn('inline-flex items-center text-xs whitespace-nowrap text-fg-3', className)}
      >
        {placeholder}
      </span>
    ) : null;
  }
  const text = dueText(dueDate, state, today);
  const relative = state === 'soon' || state === 'today' || state === 'overdue';
  return (
    <span
      data-due={state}
      title={relative && !withDate ? `Due ${formatShortDate(dueDate, today)}` : undefined}
      className={cn('inline-flex items-center gap-1.5 text-xs whitespace-nowrap tabular-nums', className)}
    >
      <span className={TONE[state]}>{text}</span>
      {withDate && relative ? (
        <span className="font-normal text-fg-3">{formatShortDate(dueDate, today)}</span>
      ) : null}
    </span>
  );
}
