import type { ReactNode } from 'react';
import { cn } from '../cn';

export interface AppFrameProps {
  /** The Rail. */
  rail: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Full-height grid: 64px rail, then the content area (which scrolls inside its own panes). */
export function AppFrame({ rail, children, className }: AppFrameProps) {
  return (
    <div className={cn('grid h-dvh grid-cols-[64px_minmax(0,1fr)] overflow-hidden bg-bg text-fg', className)}>
      {rail}
      <main className="flex min-h-0 min-w-0 flex-col">{children}</main>
    </div>
  );
}
