import { cn } from './cn';

/*
 * The Backlog.md system actor (ledger-m3.css .m3-sys, .m3-sysl, .m3-sysdot): a filled --fg square with a
 * mono initial. People are round and agents are outlined squares, so the three never look alike.
 */

/**
 * 7px filled square for the Backlog.md actor in activity lines, next to the round person dot and the
 * cobalt agent square. Sits in the 18px first column of a timeline row (justify-self center).
 */
export function SystemActorDot({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      data-kind="system"
      className={cn('size-1.75 shrink-0 justify-self-center bg-fg', className)}
    />
  );
}
