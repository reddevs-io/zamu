import { Link } from 'react-aria-components';
import type { MemberKind } from './Avatar';
import { cn } from './cn';
import { initialsFor } from './meta';

export interface MentionChipProps {
  /** Member name without the @: "Ana Ruiz", "claude-dev". */
  name: string;
  /** Agents get a 12px outlined square with their initial before the name. */
  kind?: MemberKind;
  /** Agent initial override ("X" for codex-ci). */
  initials?: string;
  /** Link target (the member page). Without it the chip is plain text. */
  href?: string;
  className?: string;
}

const chip =
  'inline-flex items-center gap-[3px] bg-mention-bg px-1 font-semibold text-mention no-underline [vertical-align:baseline]';

/** @mention in a comment body: --mention text on --mention-bg. People read "@Ana Ruiz", agents "▢ claude-dev". */
export function MentionChip({ name, kind = 'person', initials, href, className }: MentionChipProps) {
  const content =
    kind === 'agent' ? (
      <>
        <span
          aria-hidden
          className="grid size-3 shrink-0 place-items-center border border-current font-mono text-[7px] font-medium"
        >
          {initials ?? initialsFor(name, 'agent')}
        </span>
        <span className="sr-only">@</span>
        {name}
      </>
    ) : (
      `@${name}`
    );
  if (href) {
    return (
      <Link
        href={href}
        data-mention={kind}
        className={cn(
          chip,
          'cursor-pointer outline-none hover:underline focus-visible:focus-ring',
          className,
        )}
      >
        {content}
      </Link>
    );
  }
  return (
    <span data-mention={kind} className={cn(chip, className)}>
      {content}
    </span>
  );
}
