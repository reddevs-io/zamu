import { type FormEvent, type ReactNode, useSyncExternalStore } from 'react';
import { cn, ZamuMark } from '~/ui';

// Layout of the signed-out screens (Margin frame 128, source r2/Settings.dc.html state signin): one 400px
// column centred on the page background, the workspace mark on top, and the Zamu mark with the server's
// address at the bottom.

/** Brand shown before the instance has a workspace. */
export const PRODUCT_NAME = 'Zamu';

const noSubscribe = () => () => {};

/** The address people open the app on. Null while rendering on the server. */
function useHost(): string | null {
  return useSyncExternalStore(
    noSubscribe,
    () => window.location.host,
    () => null,
  );
}

export function AuthLayout({ brand, children }: { brand: string; children: ReactNode }) {
  const host = useHost();
  return (
    <div className="relative flex min-h-dvh flex-col bg-bg text-fg">
      <main className="flex flex-1 items-center justify-center px-6 pt-16 pb-20">
        <div className="flex w-full max-w-100 flex-col gap-4.5">
          <AuthBrand brand={brand} />
          {children}
        </div>
      </main>
      {host ? (
        <footer className="absolute inset-x-0 bottom-6 flex items-center justify-center gap-1.5 text-xs text-fg-3">
          <ZamuMark size={16} />
          {PRODUCT_NAME} · self-hosted at {host}
        </footer>
      ) : null}
    </div>
  );
}

/**
 * Workspace mark and name (screens.css .auth-logo, .pmark). Before there is a workspace the brand is Zamu
 * itself, so the Zamu mark stands in for the workspace's letter tile.
 */
function AuthBrand({ brand }: { brand: string }) {
  return (
    <div className="flex items-center gap-2.5 font-semibold">
      {brand === PRODUCT_NAME ? (
        <ZamuMark size={28} />
      ) : (
        <span
          aria-hidden
          className="grid size-7 shrink-0 place-items-center rounded-sm bg-fg font-serif text-lg font-semibold text-bg"
        >
          {brand.trim().charAt(0).toUpperCase() || 'P'}
        </span>
      )}
      <span className="truncate">{brand}</span>
    </div>
  );
}

/** Serif title with the line under it (.auth-t, .auth-d). */
export function AuthHeading({ title, subtitle }: { title: string; subtitle: ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5">
      <h1 className="m-0 font-serif text-2xl leading-tight font-medium">{title}</h1>
      <div className="text-fg-2">{subtitle}</div>
    </div>
  );
}

/**
 * Column of fields with the design's 18px gap. Submits on Enter; native validation is off.
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
      className="flex flex-col gap-4.5"
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
    <p className="m-0 border-t border-line-soft pt-4 text-xs text-fg-3">
      Agents and scripts sign in with an API key instead:{' '}
      <code className="rounded-sm bg-bg-lane px-1 py-px font-mono whitespace-nowrap text-fg-2">
        {'zamu login --key <key>'}
      </code>
    </p>
  );
}

/** Two-step indicator of the setup form. */
export function SetupSteps({ step }: { step: 1 | 2 }) {
  const items = [
    { n: 1, label: 'Admin account' },
    { n: 2, label: 'Workspace' },
  ] as const;
  return (
    <ol aria-label="Setup steps" className="m-0 flex list-none items-center gap-2.5 p-0 text-sm text-fg-3">
      {items.map((item, index) => {
        const current = item.n === step;
        const done = item.n < step;
        return (
          <li key={item.n} className="flex items-center gap-2.5">
            {index > 0 ? <span aria-hidden className="h-px w-7 bg-line" /> : null}
            <span
              aria-current={current ? 'step' : undefined}
              className={cn('flex items-center gap-2', current && 'font-medium text-fg')}
            >
              <span
                aria-hidden
                className={cn(
                  'grid size-5 place-items-center rounded-pill text-xs font-semibold tabular-nums',
                  current && 'bg-fg text-bg',
                  done && 'bg-accent text-accent-ink',
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
