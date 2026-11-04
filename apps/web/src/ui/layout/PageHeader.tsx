import type { ReactNode } from 'react';
import { cn } from '../cn';

export interface PageHeaderProps {
  title?: ReactNode;
  /** Line under the title: "PAY · 12 open · grouped by status". */
  subtitle?: ReactNode;
  /** Right-aligned controls: search, primary button. */
  actions?: ReactNode;
  /** Replaces the title block (the detail pane puts the task key here). */
  children?: ReactNode;
  className?: string;
}

/** 64px header with a hairline bottom border. */
export function PageHeader({ title, subtitle, actions, children, className }: PageHeaderProps) {
  return (
    <header className={cn('flex h-16 shrink-0 items-center gap-3 border-b border-line px-6', className)}>
      {children ?? (
        <div className="min-w-0">
          <h1 className="m-0 truncate text-xl font-semibold">{title}</h1>
          {subtitle ? <div className="mt-0.75 truncate text-xs text-fg-3">{subtitle}</div> : null}
        </div>
      )}
      {actions ? <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}
