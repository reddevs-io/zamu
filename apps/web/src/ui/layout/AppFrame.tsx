import type { ReactNode } from 'react';
import { cn } from '../cn';

export interface AppFrameProps {
  /** The side column: the Sidebar, at its own width (236px, 52px collapsed). */
  rail: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Full-height grid: the side column, then the content area (which scrolls inside its own panes). */
export function AppFrame({ rail, children, className }: AppFrameProps) {
  return (
    <div className={cn('grid h-dvh grid-cols-[auto_minmax(0,1fr)] overflow-hidden bg-bg text-fg', className)}>
      {rail}
      <main className="flex min-h-0 min-w-0 flex-col">{children}</main>
    </div>
  );
}
