import { cn } from './cn';

/*
 * The Backlog.md system actor (ledger-m3.css .m3-sys, .m3-sysl, .m3-sysdot): a filled --sys-bg square with a
 * mono initial. People are round and agents are outlined squares, so the three never look alike.
 */

export interface SystemActorAvatarProps {
  /** `sm` is 18px (strips, rows, the Backlog.md block), `lg` is 28px (settings headers). */
  size?: 'sm' | 'lg';
  /** Letter inside the square. */
  initial?: string;
  /** Accessible name. */
  label?: string;
  /** A visible label next to it says the name: hide the square from assistive tech. */
  decorative?: boolean;
  className?: string;
}

export function SystemActorAvatar({
  size = 'sm',
  initial = 'B',
  label = 'Backlog.md',
  decorative = false,
  className,
}: SystemActorAvatarProps) {
  return (
    <span
      {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': label })}
      data-kind="system"
      className={cn(
        'grid shrink-0 place-items-center bg-sys-bg font-mono font-medium text-sys-fg',
        size === 'sm' ? 'size-[18px] text-[8.5px]' : 'size-7 text-[10.5px]',
        className,
      )}
    >
      {initial}
    </span>
  );
}

/**
 * 7px filled square for the Backlog.md actor in activity lines, next to the round person dot and the
 * cobalt agent square. Sits in the 18px first column of a timeline row (justify-self center).
 */
export function SystemActorDot({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      data-kind="system"
      className={cn('size-[7px] shrink-0 justify-self-center bg-sys-bg', className)}
    />
  );
}
