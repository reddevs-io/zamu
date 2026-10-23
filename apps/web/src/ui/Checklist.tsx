import type { ReactNode } from 'react';
import { cn } from './cn';

export interface ChecklistItem {
  /** Backlog.md's own number, drawn as "#1". */
  index?: number;
  text: ReactNode;
  checked: boolean;
}

export interface ChecklistProps {
  items: readonly ChecklistItem[];
  /** Accessible name of the list: "Acceptance criteria". */
  'aria-label'?: string;
  className?: string;
}

/**
 * Read-only checklist from a Backlog.md section (ledger-m3.css .m3-ck): a --done box with a tick, or an
 * outlined box. It changes when the file changes, never from a click here, so nothing is interactive.
 */
export function Checklist({ items, className, ...props }: ChecklistProps) {
  return (
    <ul aria-label={props['aria-label']} className={cn('m-0 flex list-none flex-col gap-2.5 p-0', className)}>
      {items.map((item, i) => (
        <li
          key={item.index ?? i}
          data-checked={item.checked || undefined}
          className="flex items-start gap-2 text-[13px] leading-[1.55]"
        >
          <CheckMark checked={item.checked} />
          <span className="min-w-0">
            {item.index != null ? `#${item.index} ` : null}
            {item.text}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** 12px box: filled --done with a tick when checked, outlined otherwise. Announced as "Done" / "Not done". */
export function CheckMark({ checked, className }: { checked: boolean; className?: string }) {
  return (
    <span
      role="img"
      aria-label={checked ? 'Done' : 'Not done'}
      className={cn(
        'relative mt-1 box-border size-3 shrink-0',
        checked
          ? 'bg-done after:absolute after:top-px after:left-[3.5px] after:h-[6.5px] after:w-[3px] after:rotate-45 after:border-r-[1.5px] after:border-b-[1.5px] after:border-bg after:content-[""]'
          : 'border-[1.5px] border-muted',
        className,
      )}
    />
  );
}
