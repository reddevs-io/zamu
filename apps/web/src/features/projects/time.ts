const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Compact age for "Upd" columns: "now", "3m", "1h", "2d", then "Oct 20" after a month
 * ("Oct 20 2025" when the year differs).
 */
export function shortAge(iso: string | Date, now: Date = new Date()): string {
  const then = typeof iso === 'string' ? new Date(iso) : iso;
  const elapsed = now.getTime() - then.getTime();
  if (Number.isNaN(elapsed)) return '–';
  if (elapsed < MINUTE) return 'now';
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h`;
  if (elapsed < 30 * DAY) return `${Math.floor(elapsed / DAY)}d`;
  const date = `${MONTHS[then.getMonth()]} ${then.getDate()}`;
  return then.getFullYear() === now.getFullYear() ? date : `${date} ${then.getFullYear()}`;
}
