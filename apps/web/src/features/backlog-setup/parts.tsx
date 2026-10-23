import { type ReactNode, useEffect, useRef } from 'react';
import { Link } from 'react-aria-components';
import { Button, cn, Kbd, type SetupStep, SetupSteps, SourceStatusDot } from '~/ui';

// Layout and small pieces of the Backlog.md setup route (design frames 3a to 3p, M3Setup.dc.html).

export interface SetupFrameProps {
  title: string;
  /** "PAY · Payments · nothing is written until you start"; the key is drawn in mono. */
  projectKey: string;
  subtitle: ReactNode;
  onCancel: () => void;
  /** Step list for the sidebar; null leaves it out (edit mode). */
  steps: readonly SetupStep[] | null;
  /** Line under the steps: "Step 2 of 5 · Source". */
  navHint: ReactNode;
  footer: SetupFooterProps;
  children: ReactNode;
}

/** Header with Cancel, the step sidebar, the scrolling step body and the footer with the next button. */
export function SetupFrame({
  title,
  projectKey,
  subtitle,
  onCancel,
  steps,
  navHint,
  footer,
  children,
}: SetupFrameProps) {
  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col" aria-label={title}>
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-line px-6">
        <div className="min-w-0">
          <h1 className="m-0 truncate text-[20px] leading-[1.15] font-semibold tracking-[-0.01em]">
            {title}
          </h1>
          <div className="mt-[3px] truncate text-[11.5px] text-muted">
            <span className="font-mono text-[11px] font-medium text-fg">{projectKey}</span> · {subtitle}
          </div>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Button variant="ghost" size="sm" onPress={onCancel} aria-keyshortcuts="Escape">
            Cancel
          </Button>
          <Kbd>Esc</Kbd>
        </div>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-[220px_minmax(0,1fr)]">
        <aside className="flex flex-col gap-3.5 border-r border-line bg-band px-2.5 py-[18px]">
          {steps ? <SetupSteps steps={steps} /> : null}
          <div className="px-3 text-[11.5px] leading-normal text-muted">{navHint}</div>
        </aside>
        <div className="flex min-h-0 min-w-0 flex-col">
          <div className="min-h-0 flex-1 overflow-auto">
            <div className="flex max-w-[944px] flex-col gap-4 px-8 pt-[22px] pb-7">{children}</div>
          </div>
          <SetupFooter {...footer} />
        </div>
      </div>
    </section>
  );
}

export interface SetupFooterProps {
  onBack?: (() => void) | undefined;
  hint?: ReactNode;
  next?: {
    label: string;
    onPress: () => void;
    isDisabled?: boolean;
    isPending?: boolean;
    kbd: string;
  } | null;
}

export function SetupFooter({ onBack, hint, next }: SetupFooterProps) {
  return (
    <div className="flex h-14 shrink-0 items-center gap-2.5 border-t border-line bg-band px-8">
      {onBack ? (
        <Button variant="secondary" onPress={onBack}>
          Back
        </Button>
      ) : null}
      {hint ? <span className="min-w-0 truncate text-[11.5px] text-muted">{hint}</span> : null}
      <span className="flex-1" />
      {next ? (
        <Button
          kbd={next.kbd}
          aria-keyshortcuts="Meta+Enter Control+Enter"
          onPress={next.onPress}
          isDisabled={next.isDisabled}
          isPending={next.isPending}
        >
          {next.label}
        </Button>
      ) : null}
    </div>
  );
}

/** The step's question: "Where are the files?". */
export function Question({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-baseline gap-2.5">
      <h2 className="m-0 text-[16px] font-semibold tracking-[-0.01em]">{children}</h2>
      {aside ? (
        <>
          <span className="flex-1" />
          <span className="text-[11.5px] text-muted">{aside}</span>
        </>
      ) : null}
    </div>
  );
}

const BOX_TONE = {
  ok: 'border-line bg-surface',
  error: 'border-danger bg-danger-bg',
  warn: 'border-warn bg-warn-bg',
} as const;

const BOX_DOT = { ok: 'healthy', error: 'failed', warn: 'warnings' } as const;

export interface DetailBoxProps {
  tone: keyof typeof BOX_TONE;
  children: ReactNode;
  /** Right-aligned action, such as "Use another folder". */
  trailing?: ReactNode;
  className?: string;
}

/** Bordered result box with a state dot (.su-det, .su-dete, .su-detw). */
export function DetailBox({ tone, children, trailing, className }: DetailBoxProps) {
  return (
    <div
      role={tone === 'error' ? 'alert' : undefined}
      className={cn('flex items-start gap-2.5 border px-3.5 py-3 leading-[1.55]', BOX_TONE[tone], className)}
    >
      <SourceStatusDot state={BOX_DOT[tone]} decorative className="mt-1.5" />
      <div className="min-w-0 flex-1">{children}</div>
      {trailing}
    </div>
  );
}

/** Caps caption with a count and an optional hint: "STATUS 6 Drafts always come in as Backlog.". */
export function SectionCaption({ label, count, hint }: { label: string; count?: number; hint?: ReactNode }) {
  return (
    <div className="flex items-baseline gap-2.5">
      <span className="caps">{label}</span>
      {count !== undefined ? (
        <span className="font-mono text-[10.5px] text-faint">{count.toLocaleString('en-US')}</span>
      ) : null}
      {hint ? <span className="text-[11.5px] text-muted">{hint}</span> : null}
    </div>
  );
}

/** Mono identifier inside running text: task keys, prefixes, folders. */
export function Mono({ children }: { children: ReactNode }) {
  return <span className="font-mono text-[11px] font-medium">{children}</span>;
}

/** An in-app link styled as accent text. */
export function TextLink({
  href,
  children,
  newTab,
}: {
  href: string;
  children: ReactNode;
  newTab?: boolean;
}) {
  return (
    <Link
      href={href}
      {...(newTab ? { target: '_blank', rel: 'noreferrer' } : {})}
      className="cursor-pointer text-accent outline-none hover:underline focus-visible:focus-ring"
    >
      {children}
    </Link>
  );
}

/** Quiet text action on the right of a box: "Use another folder". */
export function QuietAction({ onPress, children }: { onPress: () => void; children: ReactNode }) {
  return (
    <Button variant="ghost" size="sm" onPress={onPress} className="-my-1 h-6 px-1 text-[12px]">
      {children}
    </Button>
  );
}

/**
 * ⌘↵ / Ctrl↵ continues. Listens in the capture phase: a focused React Aria button or select handles
 * Enter itself and would swallow the shortcut before the bubble-phase hotkeys see it. Keys pressed
 * inside an open dialog, listbox or menu are left alone.
 */
export function useContinueShortcut(handler: () => void, enabled = true) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || !(event.metaKey || event.ctrlKey) || event.isComposing) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('[role="dialog"],[role="listbox"],[role="menu"]')) return;
      event.preventDefault();
      event.stopPropagation();
      ref.current();
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [enabled]);
}
