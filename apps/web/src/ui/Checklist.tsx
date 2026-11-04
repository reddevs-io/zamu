import { cn } from './cn';

/** 12px box: filled --status-done with a tick when checked, outlined otherwise. Announced as "Done" / "Not done". */
export function CheckMark({ checked, className }: { checked: boolean; className?: string }) {
  return (
    <span
      role="img"
      aria-label={checked ? 'Done' : 'Not done'}
      className={cn(
        'relative mt-1 box-border size-3 shrink-0',
        checked
          ? 'bg-status-done after:absolute after:top-px after:left-[3.5px] after:h-[6.5px] after:w-[3px] after:rotate-45 after:border-r-[1.5px] after:border-b-[1.5px] after:border-bg after:content-[""]'
          : 'border-[1.5px] border-fg-2',
        className,
      )}
    />
  );
}
