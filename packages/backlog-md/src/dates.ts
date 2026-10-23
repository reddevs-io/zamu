const TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})(?:(?:T|[ \t]+)(\d{2}):(\d{2})(?::(\d{2})(\.\d+)?)?[ \t]*(Z|[+-]\d{2}:?\d{2})?)?$/i;
const TWO_DIGIT_YEAR_PATTERN = /^(\d{2})([-/.])(\d{2})\2(\d{2})$/;

function utcDate(year: number, month: number, day: number, hours = 0, minutes = 0, seconds = 0): Date | null {
  const date = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hours ||
    date.getUTCMinutes() !== minutes ||
    date.getUTCSeconds() !== seconds
  ) {
    return null;
  }
  return date;
}

function stripQuotes(value: string): string {
  return value.trim().replace(/^['"]|['"]$/g, '');
}

/**
 * Reads a Backlog.md created or updated date. Accepted: ISO with a zone (2026-10-21T14:26:00Z),
 * YYYY-MM-DD HH:mm (optionally :ss), YYYY-MM-DD, and the old two-digit-year forms DD-MM-YY,
 * DD/MM/YY, DD.MM.YY (years 2000-2099). A value without a zone is UTC. Returns null when unreadable.
 */
export function parseBacklogDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  const text = stripQuotes(String(value));
  if (!text) return null;

  const twoDigit = text.match(TWO_DIGIT_YEAR_PATTERN);
  if (twoDigit) {
    return utcDate(2000 + Number(twoDigit[4]), Number(twoDigit[3]), Number(twoDigit[1]));
  }

  const match = text.match(TIMESTAMP_PATTERN);
  if (!match) return null;
  const [, year, month, day, hours = '0', minutes = '0', seconds = '0', fraction, zone] = match;
  const wall = utcDate(
    Number(year),
    Number(month),
    Number(day),
    Number(hours),
    Number(minutes),
    Number(seconds),
  );
  if (!wall) return null;
  const millis = fraction ? Math.floor(Number(fraction) * 1000) : 0;
  let offsetMinutes = 0;
  if (zone && zone.toUpperCase() !== 'Z') {
    const offset = zone.match(/^([+-])(\d{2}):?(\d{2})$/);
    if (!offset) return null;
    const hoursOffset = Number(offset[2]);
    const minutesOffset = Number(offset[3]);
    if (hoursOffset > 14 || minutesOffset > 59) return null;
    offsetMinutes = (offset[1] === '-' ? -1 : 1) * (hoursOffset * 60 + minutesOffset);
  }
  return new Date(wall.getTime() + millis - offsetMinutes * 60_000);
}

const DUE_DATE_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})(?:[ T](?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,9})?)?(?:Z|[+-](?:(?:0\d|1[0-3]):?[0-5]\d|14:?00))?)?$/;

/**
 * A due date names a day. Backlog.md stores YYYY-MM-DD and tolerates a trailing time from older
 * files; the day is kept as written. Returns undefined for no value, null for an unreadable one.
 */
export function parseDueDate(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return undefined;
  const text = stripQuotes(String(value));
  if (!text) return undefined;
  const match = text.match(DUE_DATE_PATTERN);
  if (!match) return null;
  const [, year, month, day] = match;
  if (!utcDate(Number(year), Number(month), Number(day))) return null;
  return `${year}-${month}-${day}`;
}
