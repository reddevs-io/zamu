import type { ReactNode } from 'react';
import { cn } from '../cn';

export interface FilterBarProps {
  /** Filters (Select with variant="filter"), a legend, or tabs. */
  children: ReactNode;
  /** Right-aligned note, for example "Sorted by last update". */
  end?: ReactNode;
  className?: string;
}

/** 36px strip under the page header. */
export function FilterBar({ children, end, className }: FilterBarProps) {
  return (
    <div
      className={cn(
        'flex h-9 shrink-0 items-center gap-4 border-b border-line-soft px-6 text-sm text-fg-3',
        className,
      )}
    >
      {children}
      {end ? <span className="ml-auto">{end}</span> : null}
    </div>
  );
}

/** Read-only filter text: "Status Any". */
export function FilterValue({ label, value }: { label: string; value: ReactNode }) {
  return (
    <span>
      {label} <span className="font-medium text-fg">{value}</span>
    </span>
  );
}
