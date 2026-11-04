import type { ReactNode } from 'react';
import { cn } from './cn';

export interface StatTileProps {
  /** Caps caption: "Scope", "Done". */
  label: string;
  /** Big number. */
  value: ReactNode;
  /** Line under the number: "3 added after start", "50%". */
  sub?: ReactNode;
  /** Number color: `done` (Completed), `warn` (Rolled over), `muted` (Canceled). */
  tone?: 'default' | 'done' | 'warn' | 'muted';
  className?: string;
}

const TONE: Record<NonNullable<StatTileProps['tone']>, string> = {
  default: 'text-fg',
  done: 'text-status-done',
  warn: 'text-danger',
  muted: 'text-fg-2',
};

/** One cell of a StatStrip: caption, 20px number, sub line. */
export function StatTile({ label, value, sub, tone = 'default', className }: StatTileProps) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-0.75 border-r border-[var(--stat-line)] px-4 py-3 last:border-r-0',
        className,
      )}
    >
      <dt className="text-xs font-medium text-fg-3">{label}</dt>
      <dd
        className={cn('m-0 text-xl leading-tight font-semibold tracking-[-0.01em] tabular-nums', TONE[tone])}
      >
        {value}
      </dd>
      {sub != null ? <dd className="m-0 truncate text-xs text-fg-2">{sub}</dd> : null}
    </div>
  );
}

export interface StatStripProps {
  /** StatTile elements. */
  children: ReactNode;
  /** Number of equal columns (defaults to the number of children). */
  columns?: number;
  /**
   * `boxed`: hairline --line border around and between tiles (completed cycle page).
   * `inset`: no outer border and --line-soft dividers, for use inside a card (current cycle card).
   */
  variant?: 'boxed' | 'inset';
  'aria-label'?: string;
  className?: string;
}

/** Row of StatTiles in equal columns. Rendered as a description list. */
export function StatStrip({ children, columns, variant = 'boxed', className, ...props }: StatStripProps) {
  const count = columns ?? (Array.isArray(children) ? children.length : 1);
  return (
    <dl
      {...props}
      style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}
      className={cn(
        'm-0 grid',
        variant === 'boxed'
          ? 'border border-line [--stat-line:var(--line)]'
          : '[--stat-line:var(--line-soft)]',
        className,
      )}
    >
      {children}
    </dl>
  );
}
