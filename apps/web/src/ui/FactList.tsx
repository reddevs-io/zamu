import type { ReactNode } from 'react';
import { cn } from './cn';

export interface Fact {
  id: string;
  /** "Mode", "Last refresh", "Next check". */
  label: ReactNode;
  value: ReactNode;
}

export interface FactListProps {
  items: readonly Fact[];
  /** Label column in px: 140 on the settings page (default), 96 in the source popover. */
  labelWidth?: number;
  /** `md` (default) is 12.5px with muted 12px labels; `sm` is 12px for popovers. */
  size?: 'md' | 'sm';
  className?: string;
}

/**
 * Two-column label and value list (ledger-m3.css .m3-facts; the source popover's .mm-facts). Used for the
 * Backlog.md status on the settings page and in the header popover.
 */
export function FactList({ items, labelWidth = 140, size = 'md', className }: FactListProps) {
  return (
    <dl
      style={{ gridTemplateColumns: `${labelWidth}px minmax(0, 1fr)` }}
      className={cn(
        'm-0 grid items-baseline',
        size === 'md' ? 'gap-x-4 gap-y-2 text-sm' : 'gap-x-2.5 gap-y-1.5 text-sm',
        className,
      )}
    >
      {items.map((fact) => (
        <div key={fact.id} className="contents">
          <dt className={cn('text-fg-2', size === 'md' && 'text-sm')}>{fact.label}</dt>
          <dd className="m-0 min-w-0">{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}
