import type { ReactNode } from 'react';
import { cn } from './cn';
import { SourceStatusDot } from './SourceStatus';
import { TruncatedPath } from './SourceStrip';

export interface ProblemListProps {
  /** Accessible name: "Problems in the last refresh", "Will be skipped". */
  'aria-label'?: string;
  /** ProblemRow elements. */
  children: ReactNode;
  className?: string;
}

/** Bordered list of skipped files and warnings (ledger-m3.css .m3-issues). */
export function ProblemList({ children, className, ...props }: ProblemListProps) {
  return (
    <ul
      aria-label={props['aria-label']}
      className={cn('m-0 flex list-none flex-col border border-line bg-surface p-0', className)}
    >
      {children}
    </ul>
  );
}

export interface ProblemRowProps {
  /** `error`: a file was skipped (--danger dot). `warning`: a value fell back or a file was kept (--warn dot). */
  severity: 'error' | 'warning';
  /** File path, or a short subject such as `status "Blocked" · 2 tasks`. */
  file?: string;
  /** Why: "frontmatter is not valid YAML (line 4)". */
  children: ReactNode;
  /**
   * `columns` (default): dot, file (up to 280px, cut at the end), muted reason, as on the settings page.
   * `stacked`: file above the reason, as in the setup preview.
   * `inline`: "file · reason" on one line.
   */
  layout?: 'columns' | 'stacked' | 'inline';
  className?: string;
}

export function ProblemRow({ severity, file, children, layout = 'columns', className }: ProblemRowProps) {
  const dot = (
    <SourceStatusDot
      state={severity === 'error' ? 'failed' : 'warnings'}
      label={severity === 'error' ? 'Skipped' : 'Warning'}
      className="self-center"
    />
  );
  const row = 'grid items-baseline gap-3 border-b border-line-2 px-3 py-2 text-[12px] last:border-b-0';
  if (!file || layout === 'inline') {
    return (
      <li className={cn(row, 'grid-cols-[10px_minmax(0,1fr)]', className)} data-severity={severity}>
        {dot}
        <span className="min-w-0">
          {file ? (
            <>
              <span className="font-mono text-[10.5px]">{file}</span> · {children}
            </>
          ) : (
            children
          )}
        </span>
      </li>
    );
  }
  if (layout === 'stacked') {
    return (
      <li className={cn(row, 'grid-cols-[10px_minmax(0,1fr)]', className)} data-severity={severity}>
        {dot}
        <span className="flex min-w-0 flex-col gap-0.5">
          <TruncatedPath path={file} truncate="end" />
          <span className="text-muted">{children}</span>
        </span>
      </li>
    );
  }
  return (
    <li
      className={cn(row, 'grid-cols-[10px_minmax(0,280px)_minmax(0,1fr)]', className)}
      data-severity={severity}
    >
      {dot}
      <TruncatedPath path={file} truncate="end" />
      <span className="min-w-0 text-muted">{children}</span>
    </li>
  );
}
