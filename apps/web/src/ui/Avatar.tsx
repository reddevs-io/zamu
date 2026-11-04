import type { CSSProperties } from 'react';
import { cn } from './cn';
import { hueFromName, initialsFor } from './meta';

export type MemberKind = 'person' | 'agent';

/**
 * Avatar sizes (margin.css .av, .av.lg, .av.xl): 18px on cards, rows and menus; 22px in the task view and
 * agent cards; 28px in headers and member lists. `sm` and `md` are the older names for 18 and 28.
 */
export type AvatarSize = 'sm' | 'md' | 18 | 22 | 28;

const PX: Record<string, number> = { sm: 18, md: 28, 18: 18, 22: 22, 28: 28 };

/*
 * Initials are part of the glyph, so their size follows the avatar, not the type scale: 8.5/10/11px for
 * people and 8/9/10px for agents (margin.css). Kept here as inline sizes for that reason.
 */
const PERSON_FONT: Record<number, string> = { 18: '8.5px', 22: '10px', 28: '11px' };
const AGENT_FONT: Record<number, string> = { 18: '8px', 22: '9px', 28: '10px' };

function px(size: AvatarSize | undefined): number {
  return PX[String(size ?? 'sm')] ?? 18;
}

/** Margin agent mark: the first letters of the first two words, lower case ("claude-dev" → "cd"). */
export function agentMark(name: string): string {
  const words = name
    .trim()
    .split(/[\s\-_.]+/)
    .filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return (words[0] ?? '').slice(0, 2).toLowerCase();
  return `${words[0]?.charAt(0) ?? ''}${words[1]?.charAt(0) ?? ''}`.toLowerCase();
}

export interface AvatarProps {
  name: string;
  /** People are round with initials on a hue; agents are rounded squares with a two-letter mark. */
  kind?: MemberKind;
  /** 18 (default, `sm`), 22 or 28 (`md`). */
  size?: AvatarSize;
  /** Override the initials, for example "X" for codex-ci. */
  initials?: string;
  /**
   * Override the hue derived from the name (oklch hue angle). Agents are neutral (--fg-2) unless a hue is
   * given.
   */
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
  const side = px(size);
  const a11y = decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': name };
  if (kind === 'agent') {
    const tinted = hue != null;
    return (
      <span
        {...a11y}
        data-kind="agent"
        data-pending={pending || undefined}
        style={
          {
            width: side,
            height: side,
            fontSize: AGENT_FONT[side],
            ...(tinted ? { '--h': hue } : {}),
          } as CSSProperties
        }
        className={cn(
          'grid shrink-0 place-items-center rounded-[5px] leading-none font-semibold',
          pending
            ? 'border-[1.5px] border-dashed border-fg-3 text-fg-3'
            : tinted
              ? // Derived colour: one per agent hue, no token holds it (same as people below).
                'bg-[oklch(0.55_0.06_var(--h))] text-[oklch(0.99_0_0)]'
              : 'bg-fg-2 text-bg',
          className,
        )}
      >
        {initials ?? agentMark(name)}
      </span>
    );
  }
  return (
    <span
      {...a11y}
      data-kind="person"
      style={
        {
          '--h': hue ?? hueFromName(name),
          width: side,
          height: side,
          fontSize: PERSON_FONT[side],
        } as CSSProperties
      }
      className={cn(
        // Derived colour: each person gets a hue from their name; the lightness and chroma are the design's
        // (.av-ana, .av-tf). No token holds per-person colours.
        'grid shrink-0 place-items-center rounded-full bg-[oklch(0.6_0.12_var(--h))] leading-none font-semibold text-[oklch(0.99_0_0)]',
        className,
      )}
    >
      {initials ?? initialsFor(name, kind)}
    </span>
  );
}

export interface MemberLabelProps extends Omit<AvatarProps, 'decorative' | 'className'> {
  /** "for Ana Ruiz" shown after agents. */
  onBehalfOf?: string;
  className?: string;
}

/** Avatar plus name, as in the assignee column: "claude-dev for Ana". Truncates. */
export function MemberLabel({ className, onBehalfOf, ...avatar }: MemberLabelProps) {
  return (
    <span className={cn('flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap', className)}>
      <Avatar {...avatar} decorative />
      <span className="truncate">{avatar.name}</span>
      {onBehalfOf ? <span className="truncate text-xs text-fg-3">for {onBehalfOf}</span> : null}
    </span>
  );
}

export interface UnassignedAvatarProps {
  /** 18 (default), 22 or 28. */
  size?: AvatarSize;
  /** Accessible name; set `decorative` when a visible label says it. */
  label?: string;
  decorative?: boolean;
  className?: string;
}

/** Dashed empty circle in the avatar slot of an unassigned task (margin.css .av.none). */
export function UnassignedAvatar({
  size = 'sm',
  label = 'Unassigned',
  decorative = false,
  className,
}: UnassignedAvatarProps) {
  const side = px(size);
  return (
    <span
      {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': label })}
      data-kind="none"
      style={{ width: side, height: side }}
      className={cn('block shrink-0 rounded-full border-[1.5px] border-dashed border-fg-3', className)}
    />
  );
}
