import type { ReactNode } from 'react';
import { Button as AriaButton, type ButtonProps as AriaButtonProps } from 'react-aria-components';
import { cn, composeTw } from './cn';

/*
 * Mirror and connection state markers (ledger-m3.css .m3-dot and its modifiers). Status colours reuse the
 * M1 and M2 tokens: --done healthy, --accent pie while reading, --warn problems, --danger failed, and a
 * --faint outline for paused and detached.
 */

export const SOURCE_DOT_STATES = ['healthy', 'reading', 'warnings', 'failed', 'paused', 'detached'] as const;
export type SourceDotState = (typeof SOURCE_DOT_STATES)[number];

export const SOURCE_DOT_LABELS: Record<SourceDotState, string> = {
  healthy: 'Healthy',
  reading: 'Refreshing',
  warnings: 'Problems',
  failed: 'Failed',
  paused: 'Paused',
  detached: 'Detached',
};

const DOT_CLASS: Record<SourceDotState, string> = {
  healthy: 'bg-done',
  reading: 'rounded-full border-[1.5px] border-accent bg-[conic-gradient(var(--accent)_0_40%,transparent_0)]',
  warnings: 'bg-warn',
  failed: 'bg-danger',
  paused: 'border-[1.5px] border-faint',
  detached: 'border-[1.5px] border-faint',
};

export interface SourceStatusDotProps {
  state: SourceDotState;
  /**
   * Accessible name; defaults to the state name ("Healthy"). Pass `decorative` when visible text next to
   * the dot already says the state.
   */
  label?: string;
  decorative?: boolean;
  className?: string;
}

/** 8px state marker for a mirror (or a connection): healthy, reading, warnings, failed, paused, detached. */
export function SourceStatusDot({ state, label, decorative = false, className }: SourceStatusDotProps) {
  return (
    <span
      {...(decorative
        ? { 'aria-hidden': true }
        : { role: 'img', 'aria-label': label ?? SOURCE_DOT_LABELS[state] })}
      data-state={state}
      className={cn('box-border inline-block size-2 shrink-0', DOT_CLASS[state], className)}
    />
  );
}

export interface SourceButtonProps extends Omit<AriaButtonProps, 'children'> {
  /** Drives the dot: healthy, reading, warnings, failed, paused. */
  state: SourceDotState;
  /** Faint text after the label: "3m ago", "31 problems", "failed 14m ago". */
  note?: ReactNode;
  /** Defaults to "Backlog.md". */
  label?: ReactNode;
  /**
   * Forces the open look (focus border on --sel). Inside a DialogTrigger the button also turns open by
   * itself through aria-expanded.
   */
  isOpen?: boolean;
}

/**
 * The source button in a mirrored project's header: dot, "Backlog.md", a faint note and ▾. Put it in a
 * DialogTrigger with a Popover for the status popover. States from the design: default, open, warning,
 * failed (set `state` and `note`).
 */
export function SourceButton({ state, note, label = 'Backlog.md', isOpen, ...props }: SourceButtonProps) {
  return (
    <AriaButton
      {...props}
      data-open={isOpen || undefined}
      className={composeTw(
        props.className,
        cn(
          'box-border inline-flex h-[26px] shrink-0 cursor-pointer items-center gap-[7px] border px-[9px] text-[12px] whitespace-nowrap text-fg outline-none',
          'border-line bg-surface hover:border-muted focus-visible:focus-ring',
          'aria-expanded:border-focus aria-expanded:bg-sel data-open:border-focus data-open:bg-sel',
        ),
      )}
    >
      {/* Not decorative: the state name joins the button's accessible name ("Problems Backlog.md 31 problems"). */}
      <SourceStatusDot state={state} />
      <span>{label}</span>
      {note ? <span className="text-faint">{note}</span> : null}
      <span aria-hidden className="text-faint">
        ▾
      </span>
    </AriaButton>
  );
}
