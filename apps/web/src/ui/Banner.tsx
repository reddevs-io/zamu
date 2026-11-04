import type { ReactNode } from 'react';
import { cn } from './cn';
import { LockGlyph } from './Glyphs';

export interface BannerProps {
  children: ReactNode;
  /** Trailing action, usually a small secondary Button such as Try again. */
  action?: ReactNode;
  /**
   * `error`: --danger on --danger-soft, radius md (margin.css .err; request failures).
   * `info`: inline note with an accent dot, as in "Copy it now. You won't see it again."
   * `note`: read-only note on --bg-lane with a lock (screens.css .ro-note): "Fields come from the file…".
   */
  tone?: 'error' | 'info' | 'note';
  className?: string;
}

export function Banner({ children, action, tone = 'error', className }: BannerProps) {
  if (tone === 'info') {
    return (
      <div role="note" className={cn('flex items-start gap-2.5 leading-normal', className)}>
        <span aria-hidden className="mt-1.5 size-1.75 shrink-0 rounded-full bg-accent" />
        <div className="min-w-0 flex-1">{children}</div>
        {action}
      </div>
    );
  }
  if (tone === 'note') {
    return (
      <div
        role="note"
        className={cn(
          'flex items-center gap-2 rounded-md bg-bg-lane px-3 py-2.5 text-sm text-fg-2',
          className,
        )}
      >
        <LockGlyph className="text-fg-2" />
        <div className="min-w-0 flex-1">{children}</div>
        {action}
      </div>
    );
  }
  return (
    <div
      role="alert"
      className={cn(
        'flex items-center gap-2.5 rounded-md bg-danger-soft px-3 py-2.5 text-sm font-medium text-danger',
        // The action button takes the danger colour with a tinted border (margin.css .err .btn).
        '[&_button]:border-[color-mix(in_oklch,var(--danger)_40%,transparent)] [&_button]:text-danger',
        className,
      )}
    >
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  );
}

/** Read-only note for mirrored data: lock plus the reason (Banner tone="note"). */
export function ReadOnlyNote({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Banner tone="note" className={className}>
      {children}
    </Banner>
  );
}
