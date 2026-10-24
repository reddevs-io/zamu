import type { CSSProperties } from 'react';
import { cn } from './cn';
import { hueFromName, initialsFor } from './meta';

export type MemberKind = 'person' | 'agent';

export interface AvatarProps {
  name: string;
  /** People are circles with initials; agents are cobalt outlined squares with a mono initial. */
  kind?: MemberKind;
  /** `sm` is 18px (rows, chips), `md` is 28px (members list, rail). */
  size?: 'sm' | 'md';
  /** Override the initials, for example "X" for codex-ci. */
  initials?: string;
  /** Override the hue derived from the name (oklch hue angle). */
  hue?: number;
  /** Visible label next to the avatar is present, so hide the avatar from assistive tech. */
  decorative?: boolean;
  /** An agent that doesn't exist yet (a suggestion): dashed outline. */
  pending?: boolean;
  className?: string;
}

export function Avatar({
  name,
  kind = 'person',
  size = 'sm',
  initials,
  hue,
  decorative = false,
  pending = false,
  className,
}: AvatarProps) {
  const text = initials ?? initialsFor(name, kind);
  const a11y = decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': name };
  if (kind === 'agent') {
    return (
      <span
        {...a11y}
        data-kind="agent"
        data-pending={pending || undefined}
        className={cn(
          'grid shrink-0 place-items-center border-[1.5px] border-accent font-mono font-medium text-accent',
          pending && 'border-dashed',
          size === 'sm' ? 'size-[18px] text-[9px]' : 'size-7 text-[11px]',
          className,
        )}
      >
        {text}
      </span>
    );
  }
  return (
    <span
      {...a11y}
      data-kind="person"
      style={{ '--h': hue ?? hueFromName(name) } as CSSProperties}
      className={cn(
        'grid shrink-0 place-items-center rounded-full bg-[oklch(0.86_0.06_var(--h))] font-semibold text-[oklch(0.32_0.08_var(--h))]',
        size === 'sm' ? 'size-[18px] text-[8.5px]' : 'size-7 text-[10.5px]',
        className,
      )}
    >
      {text}
    </span>
  );
}

export interface MemberLabelProps extends Omit<AvatarProps, 'decorative' | 'className'> {
  /** "for Ana Ruiz" line shown under or next to agents. */
  onBehalfOf?: string;
  className?: string;
}

/** Avatar plus name, as in the assignee column. Truncates. */
export function MemberLabel({ className, onBehalfOf, ...avatar }: MemberLabelProps) {
  return (
    <span className={cn('flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap', className)}>
      <Avatar {...avatar} decorative />
      <span className="truncate">{avatar.name}</span>
      {onBehalfOf ? <span className="truncate text-[11.5px] text-muted">for {onBehalfOf}</span> : null}
    </span>
  );
}

export interface UnassignedAvatarProps {
  /** `sm` is 18px, `md` is 28px. */
  size?: 'sm' | 'md';
  /** Accessible name; set `decorative` when a visible label says it. */
  label?: string;
  decorative?: boolean;
  className?: string;
}

/** Dashed empty circle in the avatar slot of an unassigned task. */
export function UnassignedAvatar({
  size = 'sm',
  label = 'Unassigned',
  decorative = false,
  className,
}: UnassignedAvatarProps) {
  return (
    <span
      {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': label })}
      data-kind="none"
      className={cn(
        'block shrink-0 rounded-full border-[1.5px] border-dashed border-faint',
        size === 'sm' ? 'size-[18px]' : 'size-7',
        className,
      )}
    />
  );
}
