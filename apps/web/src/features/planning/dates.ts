import type { Cycle } from '@pm/contracts';

// Calendar days for milestones and cycles. Dates are CalendarDate strings ("2026-11-14") with no time
// or zone; arithmetic runs in UTC so a day is always 24 hours. "Today" comes from the server when it can
// (a current cycle's daysLeft is counted in APP_TIME_ZONE), else from the browser clock.

const DAY_MS = 86_400_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LONG_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const toUtc = (date: string) => Date.parse(`${date}T00:00:00Z`);
const fromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function isCalendarDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(toUtc(value));
}

export function parts(date: string): { year: number; month: number; day: number } {
  const value = new Date(toUtc(date));
  return { year: value.getUTCFullYear(), month: value.getUTCMonth(), day: value.getUTCDate() };
}

export function makeDate(year: number, month: number, day: number): string {
  return fromUtc(Date.UTC(year, month, day));
}

export function addDays(date: string, days: number): string {
  return fromUtc(toUtc(date) + days * DAY_MS);
}

/** Whole days from `from` to `to`: 0 on the same day, negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS);
}

/** Days from `start` to `end`, both included. */
export function lengthInDays(start: string, end: string): number {
  return daysBetween(start, end) + 1;
}

/** 0 Sunday .. 6 Saturday. */
export function weekday(date: string): number {
  return new Date(toUtc(date)).getUTCDay();
}

/** The browser's calendar day for a clock reading. */
export function localDay(now: number): string {
  const date = new Date(now);
  return makeDate(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Today as the server counts it. A current cycle carries days left in APP_TIME_ZONE, which pins the
 * server's day; without one the browser's day is close enough.
 */
export function planningToday(
  now: number,
  current?: (Pick<Cycle, 'endsOn'> & { daysLeft: number | null; state?: Cycle['state'] }) | null,
): string {
  if (current?.daysLeft != null && (current.state ?? 'current') === 'current') {
    return addDays(current.endsOn, 1 - current.daysLeft);
  }
  return localDay(now);
}

/** The first Monday strictly after `date` (the first cycle's default start, as in core). */
export function nextMonday(date: string): string {
  return addDays(date, (8 - weekday(date)) % 7 || 7);
}

export function endOfMonth(date: string): string {
  const { year, month } = parts(date);
  return makeDate(year, month + 1, 0);
}

export function endOfQuarter(date: string): string {
  const { year, month } = parts(date);
  return makeDate(year, Math.floor(month / 3) * 3 + 3, 0);
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** "Oct 20"; with the year when it differs from `today`'s: "Jan 30, 2027". */
export function formatDay(date: string, today?: string): string {
  const { year, month, day } = parts(date);
  const short = `${MONTHS[month]} ${day}`;
  if (today && parts(today).year === year) return short;
  return today ? `${short}, ${year}` : short;
}

/** "Dec 12, 2026": the date field. */
export function formatFullDay(date: string): string {
  const { year, month, day } = parts(date);
  return `${MONTHS[month]} ${day}, ${year}`;
}

/** "Mon, Nov 23": cycle date fields. */
export function formatWeekdayDay(date: string): string {
  return `${WEEKDAYS[weekday(date)]?.slice(0, 3)}, ${formatDay(date)}`;
}

/** "Monday, Oct 26". */
export function formatLongWeekdayDay(date: string): string {
  return `${WEEKDAYS[weekday(date)]}, ${formatDay(date)}`;
}

/** "December 2026": calendar caption. */
export function formatMonth(year: number, month: number): string {
  return `${LONG_MONTHS[month]} ${year}`;
}

/** "Oct 12 – Oct 25". Years show only when the range leaves `today`'s year. */
export function formatRange(start: string, end: string, today?: string): string {
  return `${formatDay(start, today)} – ${formatDay(end, today)}`;
}

/** "Oct 27 – Nov 9", "Nov 10 – 23" in one month, "Dec 29, 2026 – Jan 11, 2027" across years: cycle rows. */
export function formatShortRange(start: string, end: string): string {
  const a = parts(start);
  const b = parts(end);
  if (a.year !== b.year)
    return `${MONTHS[a.month]} ${a.day}, ${a.year} – ${MONTHS[b.month]} ${b.day}, ${b.year}`;
  if (a.month === b.month) return `${MONTHS[a.month]} ${a.day} – ${b.day}`;
  return `${MONTHS[a.month]} ${a.day} – ${MONTHS[b.month]} ${b.day}`;
}

/** "2 weeks", "1 week", "10 days", "1 day". */
export function formatLength(days: number): string {
  if (days % 7 === 0) return days === 7 ? '1 week' : `${days / 7} weeks`;
  return days === 1 ? '1 day' : `${days} days`;
}

/** "Two weeks" in a sentence start: the empty cycles page. */
export function formatLengthSentence(days: number): string {
  const words: Record<number, string> = {
    1: 'One',
    2: 'Two',
    3: 'Three',
    4: 'Four',
    5: 'Five',
    6: 'Six',
    7: 'Seven',
    8: 'Eight',
  };
  if (days % 7 === 0) {
    const weeks = days / 7;
    return `${words[weeks] ?? weeks} ${weeks === 1 ? 'week' : 'weeks'}`;
  }
  return `${days} days`;
}

/** Under a milestone's target: "22 days left", "Due today", "3 days overdue". */
export function describeTarget(daysLeft: number): { text: string; overdue: boolean } {
  if (daysLeft < 0) {
    const late = -daysLeft;
    return { text: `${late} ${late === 1 ? 'day' : 'days'} overdue`, overdue: true };
  }
  if (daysLeft === 0) return { text: 'Due today', overdue: false };
  return { text: `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left`, overdue: false };
}

/** Result column of an upcoming cycle: "Starts Monday", "Starts in 17 days". */
export function describeStart(startsOn: string, today: string): string {
  const days = daysBetween(today, startsOn);
  if (days <= 0) return 'Starts today';
  if (days === 1) return 'Starts tomorrow';
  if (days < 7) return `Starts ${WEEKDAYS[weekday(startsOn)]}`;
  return `Starts in ${days} days`;
}

/** "ends Sunday", "ends today", "ends Oct 25". */
export function describeEnd(endsOn: string, today: string): string {
  const days = daysBetween(today, endsOn);
  if (days <= 0) return 'ends today';
  if (days === 1) return 'ends tomorrow';
  if (days < 7) return `ends ${WEEKDAYS[weekday(endsOn)]}`;
  return `ends ${formatDay(endsOn, today)}`;
}

// ---------------------------------------------------------------------------
// Calendar grid
// ---------------------------------------------------------------------------

export interface CalendarCell {
  date: string;
  day: number;
  /** In the shown month (others are the faded days before and after). */
  inMonth: boolean;
}

/** Weeks of a month, Monday first, padded with the neighbouring months' days. */
export function monthGrid(year: number, month: number): CalendarCell[][] {
  const first = makeDate(year, month, 1);
  const lead = (weekday(first) + 6) % 7;
  const daysInMonth = parts(makeDate(year, month + 1, 0)).day;
  const weeks = Math.ceil((lead + daysInMonth) / 7);
  const start = addDays(first, -lead);
  const grid: CalendarCell[][] = [];
  for (let week = 0; week < weeks; week++) {
    const row: CalendarCell[] = [];
    for (let index = 0; index < 7; index++) {
      const date = addDays(start, week * 7 + index);
      const value = parts(date);
      row.push({ date, day: value.day, inMonth: value.month === month });
    }
    grid.push(row);
  }
  return grid;
}
