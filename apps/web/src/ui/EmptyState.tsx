import type { ReactNode } from 'react';
import { CodeBlock } from './CodeBlock';
import { cn } from './cn';

export interface EmptyStateProps {
  title: ReactNode;
  text?: ReactNode;
  /** Usually a primary Button with a Kbd hint; several go side by side. */
  action?: ReactNode;
  /** CLI alternative shown under the action. */
  cli?: { label?: string; command: string; copyable?: boolean };
  /**
   * `start` (default): left-aligned, as the older screens place it. `center`: the Margin empty state
   * (margin.css .empty), centred in its area.
   */
  align?: 'start' | 'center';
  /** Draw the dashed frame around it (Home's "Nothing needs you"). */
  framed?: boolean;
  /**
   * Title size: `md` text-xl (20px, default), `lg` text-2xl (30px). The design's 24px page title falls
   * between two steps of the type scale; `md` is the nearer one.
   */
  size?: 'md' | 'lg';
  className?: string;
}

/** Empty state, max 400px: serif heading, a sentence in --fg-2, actions, then an optional CLI hint. */
export function EmptyState({
  title,
  text,
  action,
  cli,
  align = 'start',
  framed = false,
  size = 'md',
  className,
}: EmptyStateProps) {
  const center = align === 'center';
  const body = (
    <div
      className={cn(
        'flex max-w-100 flex-col gap-2.5',
        center ? 'mx-auto items-center px-5 py-10 text-center' : 'items-start',
        framed && 'py-6',
        !framed && className,
      )}
    >
      <h2
        className={cn(
          'm-0 font-serif font-medium text-pretty text-fg',
          size === 'lg' ? 'text-2xl leading-tight' : 'text-xl',
        )}
      >
        {title}
      </h2>
      {text ? <p className="m-0 leading-normal text-pretty text-fg-2">{text}</p> : null}
      {action ? (
        <div className={cn('mt-1.5 flex flex-wrap gap-2', center && 'justify-center')}>{action}</div>
      ) : null}
      {cli ? (
        <div className="flex w-full flex-col gap-1.5 text-left">
          <span className="text-xs font-medium text-fg-3">{cli.label ?? 'From the CLI'}</span>
          <CodeBlock copyable={cli.copyable} copyLabel="Copy command">
            {cli.command}
          </CodeBlock>
        </div>
      ) : null}
    </div>
  );
  if (!framed) return body;
  return (
    <div className={cn('flex rounded-lg border-[1.5px] border-dashed border-line', className)}>{body}</div>
  );
}
