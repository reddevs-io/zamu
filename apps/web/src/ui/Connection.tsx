import type { ReactNode } from 'react';
import { cn } from './cn';
import { type SourceDotState, SourceStatusDot } from './SourceStatus';

// ── Provider badge ──────────────────────────────────────────────────────────────────────────────────

export const GIT_PROVIDERS = ['github', 'gitlab', 'gitea'] as const;
export type GitProviderKind = (typeof GIT_PROVIDERS)[number];

export const PROVIDER_LABELS: Record<GitProviderKind, string> = {
  github: 'GitHub',
  gitlab: 'GitLab',
  gitea: 'Gitea / Forgejo',
};

const PROVIDER_LETTERS: Record<GitProviderKind, string> = { github: 'GH', gitlab: 'GL', gitea: 'FJ' };

export interface ProviderBadgeProps {
  provider: GitProviderKind;
  /** `md` is 26px (connection rows), `sm` is 20px (inside inputs and fact lists). */
  size?: 'md' | 'sm';
  /** A visible provider name sits next to it: hide the badge from assistive tech. */
  decorative?: boolean;
  className?: string;
}

/** Letters in a hairline rounded square, no logos: GH, GL, FJ. */
export function ProviderBadge({ provider, size = 'md', decorative = false, className }: ProviderBadgeProps) {
  return (
    <span
      {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': PROVIDER_LABELS[provider] })}
      data-provider={provider}
      className={cn(
        'box-border grid shrink-0 place-items-center rounded-sm border border-line bg-surface text-xs font-semibold text-fg',
        size === 'md' ? 'size-6.5' : 'size-5 tracking-tight',
        className,
      )}
    >
      {PROVIDER_LETTERS[provider]}
    </span>
  );
}

// ── State tags ──────────────────────────────────────────────────────────────────────────────────────

export type StateTagTone = 'ok' | 'warn' | 'danger';

const TAG_TONE: Record<StateTagTone, string> = {
  ok: 'border border-line text-fg',
  warn: 'bg-danger-soft font-semibold text-danger',
  danger: 'bg-danger-soft font-semibold text-danger',
};

export interface StateTagProps {
  tone: StateTagTone;
  /** Leading dot; omit for a text-only tag ("Host unreachable" next to a connection name). */
  dot?: SourceDotState | null;
  children: ReactNode;
  className?: string;
}

/** 20px pill with a state colour. */
export function StateTag({ tone, dot, children, className }: StateTagProps) {
  return (
    <span
      data-tone={tone}
      className={cn(
        'box-border inline-flex h-5 shrink-0 items-center gap-1.5 rounded-pill px-2 text-xs whitespace-nowrap',
        TAG_TONE[tone],
        className,
      )}
    >
      {dot ? <SourceStatusDot state={dot} decorative /> : null}
      {children}
    </span>
  );
}

export const CONNECTION_STATUSES = ['working', 'rejected', 'unreachable', 'unchecked'] as const;
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

export const CONNECTION_STATUS_LABELS: Record<ConnectionStatus, string> = {
  working: 'Working',
  rejected: 'Token rejected',
  unreachable: 'Host unreachable',
  unchecked: 'Not checked',
};

const CONNECTION_LOOK: Record<ConnectionStatus, { tone: StateTagTone; dot: SourceDotState }> = {
  working: { tone: 'ok', dot: 'healthy' },
  rejected: { tone: 'danger', dot: 'failed' },
  unreachable: { tone: 'warn', dot: 'warnings' },
  unchecked: { tone: 'ok', dot: 'paused' },
};

export interface ConnectionStatusTagProps {
  status: ConnectionStatus;
  /** Defaults to true. The project settings page draws "Host unreachable" without the dot. */
  withDot?: boolean;
  /** Replaces the default label ("Working", "Token rejected", "Host unreachable", "Not checked"). */
  children?: ReactNode;
  className?: string;
}

/** Status of a git connection: Working, Token rejected, Host unreachable, or Not checked yet. */
export function ConnectionStatusTag({
  status,
  withDot = true,
  children,
  className,
}: ConnectionStatusTagProps) {
  const look = CONNECTION_LOOK[status];
  return (
    <StateTag tone={look.tone} dot={withDot ? look.dot : null} className={className}>
      {children ?? CONNECTION_STATUS_LABELS[status]}
    </StateTag>
  );
}
