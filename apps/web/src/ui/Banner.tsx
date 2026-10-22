import type { ReactNode } from 'react';
import { cn } from './cn';

export interface BannerProps {
  children: ReactNode;
  /** Trailing action, usually a secondary Button such as Retry. */
  action?: ReactNode;
  /**
   * `error`: bordered danger box (request failures).
   * `info`: inline note with an accent square, as in "Copy it now. You won't see it again."
   */
  tone?: 'error' | 'info';
  className?: string;
}

export function Banner({ children, action, tone = 'error', className }: BannerProps) {
  if (tone === 'info') {
    return (
      <div role="note" className={cn('flex items-start gap-2.5 leading-normal', className)}>
        <span aria-hidden className="mt-[5px] size-2 shrink-0 bg-accent" />
        <div className="min-w-0 flex-1">{children}</div>
        {action}
      </div>
    );
  }
  return (
    <div
      role="alert"
      className={cn(
        'flex items-center gap-3 border border-danger bg-danger-bg px-3.5 py-2.5 text-fg',
        className,
      )}
    >
      <span aria-hidden className="size-2 shrink-0 bg-danger" />
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  );
}
