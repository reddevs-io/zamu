import type { FormEvent, ReactNode } from 'react';
import { CodeBlock, cn } from '~/ui';

// Layout of the signed-out screens (design frames 01 and 02, source LgAuth.dc.html):
// a dark ledger panel on the left and a 520px form column on the right.

/** Brand shown before the instance has a workspace. */
export const PRODUCT_NAME = 'project-management';

/** Decorative sample rows: the product in one glance. Hidden from assistive technology. */
const LEDGER = [
  { key: 'PAY-142', title: 'Retry failed webhook deliveries', who: 'claude-dev' },
  { key: 'PAY-138', title: 'Signature check accepts expired timestamps', who: 'claude-dev' },
  { key: 'WEB-311', title: 'Move settings to the new layout', who: 'Tomás Berg' },
  { key: 'CLI-58', title: 'Add --json to pm tasks list', who: 'codex-ci' },
  { key: 'INF-19', title: 'Nightly Postgres backup check', who: 'Ana Ruiz' },
];

export function AuthLayout({ brand, children }: { brand: string; children: ReactNode }) {
  return (
    <div className="grid min-h-dvh bg-bg text-fg md:grid-cols-[minmax(0,1fr)_520px]">
      <aside className="flex flex-col justify-between gap-10 bg-rail px-12 py-10 text-rail-fg max-md:hidden">
        <div className="flex items-center gap-3 text-[15px] font-semibold text-rail-on">
          <span aria-hidden className="grid size-8 place-items-center bg-accent text-[14px] font-bold">
            {brand.trim().charAt(0).toUpperCase() || 'P'}
          </span>
          <span className="truncate">{brand}</span>
        </div>
        <div aria-hidden className="flex max-w-[460px] flex-col font-mono text-[11px]">
          {LEDGER.map((row) => (
            <div
              key={row.key}
              className="grid grid-cols-[72px_minmax(0,1fr)_110px] gap-3 border-t border-rail-fg/15 py-[9px] whitespace-nowrap"
            >
              {/* The rail is dark in both themes, so the key takes the dark theme's accent. */}
              <span className="dark truncate text-accent">{row.key}</span>
              <span className="truncate">{row.title}</span>
              <span className="truncate">{row.who}</span>
            </div>
          ))}
        </div>
        <p className="m-0 max-w-[420px] text-[12px] leading-normal">
          Self-hosted project management. People and agents share one task list, and every change shows who
          made it.
        </p>
      </aside>
      <main className="flex flex-col justify-center gap-[22px] border-line bg-surface px-6 py-10 sm:px-16 md:border-l">
        {children}
      </main>
    </div>
  );
}

export function AuthHeading({ title, subtitle }: { title: string; subtitle: ReactNode }) {
  return (
    <div>
      <h1 className="m-0 text-[20px] leading-[1.15] font-semibold tracking-[-0.01em]">{title}</h1>
      <div className="mt-[3px] text-[11.5px] text-muted">{subtitle}</div>
    </div>
  );
}

/**
 * Column of fields with the design's 14px gap. Submits on Enter; native validation is off.
 * method="post": a submit before hydration reloads the page instead of putting the password in the URL.
 */
export function AuthForm({
  onSubmit,
  children,
  label,
}: {
  onSubmit: () => void;
  children: ReactNode;
  label: string;
}) {
  return (
    <form
      aria-label={label}
      method="post"
      noValidate
      className="flex flex-col gap-3.5"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      {children}
    </form>
  );
}

/** "Agents and scripts sign in with an API key instead:" with the CLI command. */
export function ApiKeyHint() {
  return (
    <div className="border-t border-line-2 pt-4 text-[12px] leading-normal text-muted">
      Agents and scripts sign in with an API key instead:
      <CodeBlock className="mt-2">{'pm login --key <key>'}</CodeBlock>
    </div>
  );
}

/** Two-step indicator of the setup form. */
export function SetupSteps({ step }: { step: 1 | 2 }) {
  const items = [
    { n: 1, label: 'Admin account' },
    { n: 2, label: 'Workspace' },
  ] as const;
  return (
    <ol
      aria-label="Setup steps"
      className="m-0 flex list-none items-center gap-2.5 p-0 text-[12px] text-faint"
    >
      {items.map((item, index) => {
        const current = item.n === step;
        const done = item.n < step;
        return (
          <li key={item.n} className="flex items-center gap-2.5">
            {index > 0 ? <span aria-hidden className="h-px w-7 bg-line" /> : null}
            <span
              aria-current={current ? 'step' : undefined}
              className={cn('flex items-center gap-2', current && 'font-semibold text-fg')}
            >
              <span
                aria-hidden
                className={cn(
                  'grid size-5 place-items-center font-mono text-[10px]',
                  current && 'bg-fg text-bg',
                  done && 'bg-accent text-on-accent',
                  !current && !done && 'border border-line',
                )}
              >
                {item.n}
              </span>
              {item.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
