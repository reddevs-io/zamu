import { shortAge } from '~/features/projects/time';
import { useNow } from '~/features/tasks/clock';

/** "3m ago" ("just now" under a minute), rendered after hydration only. */
export function RelativeTime({ iso }: { iso: string }) {
  const now = useNow();
  if (now === null) return null;
  const age = shortAge(iso, new Date(now));
  return <time dateTime={iso}>{age === 'now' ? 'just now' : /\d[mhd]$/.test(age) ? `${age} ago` : age}</time>;
}

/** "38 seconds", "4 minutes": how long the first read took. */
export function formatDuration(ms: number): string {
  const seconds = Math.max(1, Math.round(ms / 1000));
  if (seconds < 120) return `${seconds} ${seconds === 1 ? 'second' : 'seconds'}`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 120) return `${minutes} minutes`;
  return `${Math.round(minutes / 60)} hours`;
}
