import type { ReactNode } from 'react';
import { cn } from '../cn';
import { lockedHatch, OwnedFieldCaption } from '../Locked';

export interface Property {
  id: string;
  label: string;
  value: ReactNode;
  /** Sub-line under the value: "for Ana Ruiz", "Oct 20". */
  sub?: ReactNode;
  /**
   * The value comes from Backlog.md: hatched cell and "· file" after the caption. Pass a string to change
   * the caption note.
   */
  locked?: boolean | string;
}

/** Four bordered cells (status, priority, assignee, created): caption, value, optional sub-line. */
export function PropertyGrid({ items, className }: { items: readonly Property[]; className?: string }) {
  return (
    <dl
      className={cn('m-0 grid border border-line', className)}
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map((item) => (
        <div
          key={item.id}
          data-locked={item.locked ? true : undefined}
          className={cn(
            'flex min-w-0 flex-col gap-1 border-r border-line px-2.5 pt-2 pb-[9px] last:border-r-0',
            item.locked && lockedHatch,
          )}
        >
          <dt className="caps">
            {item.label}
            {item.locked ? (
              <>
                {' '}
                <OwnedFieldCaption>
                  {typeof item.locked === 'string' ? item.locked : undefined}
                </OwnedFieldCaption>
              </>
            ) : null}
          </dt>
          <dd className="m-0 flex min-w-0 items-center gap-1.5 overflow-hidden font-medium whitespace-nowrap">
            {item.value}
          </dd>
          {item.sub ? <dd className="m-0 truncate text-[11.5px] text-muted">{item.sub}</dd> : null}
        </div>
      ))}
    </dl>
  );
}
