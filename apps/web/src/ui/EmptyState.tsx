import type { ReactNode } from 'react';
import { CodeBlock } from './CodeBlock';
import { cn } from './cn';

export interface EmptyStateProps {
  title: ReactNode;
  text?: ReactNode;
  /** Usually a primary Button with a Kbd hint. */
  action?: ReactNode;
  /** CLI alternative shown under the action. */
  cli?: { label?: string; command: string; copyable?: boolean };
  className?: string;
}

/** Left-aligned empty state, max 420px: heading, sentence, action, then an optional CLI hint. */
export function EmptyState({ title, text, action, cli, className }: EmptyStateProps) {
  return (
    <div className={cn('flex max-w-[420px] flex-col items-start gap-3', className)}>
      <h2 className="m-0 text-[22px] leading-tight font-semibold tracking-[-0.015em] text-pretty">{title}</h2>
      {text ? <p className="m-0 leading-[1.55] text-muted">{text}</p> : null}
      {action}
      {cli ? (
        <div className="flex w-full flex-col gap-1.5">
          <span className="caps">{cli.label ?? 'From the CLI'}</span>
          <CodeBlock copyable={cli.copyable} copyLabel="Copy command">
            {cli.command}
          </CodeBlock>
        </div>
      ) : null}
    </div>
  );
}
