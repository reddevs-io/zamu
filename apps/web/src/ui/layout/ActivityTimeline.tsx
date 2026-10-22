import type { ReactNode } from 'react';
import type { MemberKind } from '../Avatar';
import { cn } from '../cn';

export interface ActivityEntry {
  id: string;
  actor: { name: string; kind: MemberKind };
  /** The responsible human when an agent acted: renders "claude-dev for Ana Ruiz". */
  onBehalfOf?: string;
  /** "moved it from Todo to In progress". */
  action: ReactNode;
  /** Short relative time ("40m") or date ("Oct 20"). */
  time: string;
  /** ISO timestamp for the <time> element. */
  dateTime?: string;
}

/** Vertical timeline: people are round hollow nodes, agents are filled cobalt squares. */
export function ActivityTimeline({
  items,
  className,
}: {
  items: readonly ActivityEntry[];
  className?: string;
}) {
  return (
    <ol
      className={cn('m-0 ml-1 flex list-none flex-col gap-[9px] border-l border-line p-0 pl-3.5', className)}
    >
      {items.map((entry) => (
        <li
          key={entry.id}
          className="relative grid grid-cols-[minmax(0,1fr)_auto] gap-2.5 text-[12.5px] text-muted"
          data-actor-kind={entry.actor.kind}
        >
          <span
            aria-hidden
            className={cn(
              'absolute top-[5px] -left-[19px] size-[9px]',
              entry.actor.kind === 'agent' ? 'bg-accent' : 'rounded-full border-[1.5px] border-muted bg-bg',
            )}
          />
          <span>
            <b className="font-semibold text-fg">{entry.actor.name}</b>
            {entry.onBehalfOf ? ` for ${entry.onBehalfOf}` : null} {entry.action}
          </span>
          <time dateTime={entry.dateTime} className="text-right font-mono text-[10px] text-faint">
            {entry.time}
          </time>
        </li>
      ))}
    </ol>
  );
}
