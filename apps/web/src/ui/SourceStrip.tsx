import type { ReactNode } from 'react';
import { Link } from 'react-aria-components';
import { cn } from './cn';
import { SystemActorAvatar } from './SystemActor';

export interface TruncatedPathProps {
  /** Repository path, for example "backlog/tasks/back-786 - Retry-failed-webhook-deliveries.md". */
  path: string;
  /**
   * `start` cuts the beginning ("…ack-786 - Retry.md") so the file name stays readable; `end` cuts the
   * tail like normal text. Defaults to `start`.
   */
  truncate?: 'start' | 'end';
  className?: string;
}

/** Mono 10.5px file path on one line, with the full path in `title` (ledger-m3.css .m3-path). */
export function TruncatedPath({ path, truncate = 'start', className }: TruncatedPathProps) {
  const base = 'min-w-0 overflow-hidden font-mono text-[10.5px] text-ellipsis whitespace-nowrap text-fg';
  if (truncate === 'end') {
    return (
      <span title={path} className={cn(base, className)}>
        {path}
      </span>
    );
  }
  // An RTL box puts the overflow and the ellipsis on the left; <bdi dir="ltr"> keeps the path's own order.
  return (
    <span title={path} dir="rtl" className={cn(base, 'text-left', className)}>
      <bdi dir="ltr">{path}</bdi>
    </span>
  );
}

export interface NoticeStripProps {
  /** Leading marker: a SourceStatusDot or SystemActorAvatar. */
  marker?: ReactNode;
  children: ReactNode;
  /** Trailing content pushed to the right: a link, "Listening…", a progress bar. */
  trailing?: ReactNode;
  className?: string;
}

/**
 * One-line strip on --src-bg (ledger-m3.css .m3-strip): "None. Every file was read…", the refresh progress,
 * the webhook's last notification, the hidden-tasks note. Text is 12px muted; <b> inside turns --fg.
 */
export function NoticeStrip({ marker, children, trailing, className }: NoticeStripProps) {
  return (
    <div
      className={cn(
        'flex min-w-0 shrink-0 items-center gap-2.5 border border-line bg-src-bg px-3 py-2 text-[12px] text-muted [&_b]:font-semibold [&_b]:text-fg',
        className,
      )}
    >
      {marker}
      <div className="flex min-w-0 flex-1 items-center gap-2.5">{children}</div>
      {trailing}
    </div>
  );
}

export interface SourceStripProps {
  /** "Fields with a hatch come from", or "Was mirrored from" after detach. */
  lead: ReactNode;
  /** File path in the repository. Truncated from the left. */
  path: string;
  /** "Open file" (or "View file" after detach) with the provider URL. Opens in a new tab. */
  link?: { label: string; href: string };
  className?: string;
}

/** Strip at the top of a mirrored task: Backlog.md square, lead text, the file path and Open file. */
export function SourceStrip({ lead, path, link, className }: SourceStripProps) {
  return (
    <NoticeStrip
      marker={<SystemActorAvatar decorative />}
      className={className}
      trailing={
        link ? (
          <Link
            href={link.href}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 cursor-pointer whitespace-nowrap text-accent outline-none hover:underline focus-visible:focus-ring"
          >
            {link.label}
          </Link>
        ) : null
      }
    >
      <span className="shrink-0">{lead}</span>
      <TruncatedPath path={path} className="flex-1" />
    </NoticeStrip>
  );
}
