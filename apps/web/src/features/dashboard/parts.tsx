import { useSyncExternalStore } from 'react';
import { Button, cn } from '~/ui';

// Smaller pieces of the dashboard: the refresh line in the header, the new-workspace steps and a media
// query hook for the 1024px panel layout.

export type RefreshState =
  | { kind: 'loading' }
  | { kind: 'refreshing' }
  | { kind: 'fresh'; age: string }
  | { kind: 'stale'; age: string; onRetry: () => void };

/**
 * "Updated just now", "Refreshing", "Couldn't refresh · showing 3m ago · Retry" after a dot (filled when
 * the data is current, hollow while loading or stale). `dotOnly` keeps just the dot (1024px with the panel).
 */
export function RefreshLine({ state, dotOnly = false }: { state: RefreshState; dotOnly?: boolean }) {
  const text =
    state.kind === 'loading'
      ? 'Loading'
      : state.kind === 'refreshing'
        ? 'Refreshing'
        : state.kind === 'fresh'
          ? state.age
            ? `Updated ${state.age}`
            : ''
          : state.age
            ? `Couldn't refresh · showing ${state.age}`
            : "Couldn't refresh";
  const hollow = state.kind === 'loading' || state.kind === 'stale';
  return (
    <span
      role="status"
      title={text || undefined}
      aria-label={dotOnly ? text || undefined : undefined}
      data-refresh={state.kind}
      className="inline-flex shrink-0 items-center gap-1.5 font-mono text-[10px] whitespace-nowrap text-faint"
    >
      <span
        aria-hidden
        className={cn('size-1.5 shrink-0 rounded-full', hollow ? 'border-[1.5px] border-faint' : 'bg-accent')}
      />
      {dotOnly ? null : (
        <>
          {text ? <span>{text}</span> : null}
          {state.kind === 'stale' ? (
            <>
              <span aria-hidden>·</span>
              <button
                type="button"
                onClick={state.onRetry}
                className="cursor-pointer text-faint outline-none hover:text-fg focus-visible:focus-ring"
              >
                Retry
              </button>
            </>
          ) : null}
        </>
      )}
    </span>
  );
}

/** The dashboard of a workspace without projects: create one, then add an agent. */
export function NewWorkspace({
  workspace,
  onNewProject,
  onAddAgent,
}: {
  workspace: string;
  onNewProject: () => void;
  onAddAgent: () => void;
}) {
  return (
    <div data-new-workspace className="flex max-w-[640px] flex-col items-start gap-4 pt-7">
      <h2 className="m-0 text-[22px] leading-tight font-semibold tracking-[-0.015em]">Nothing to show yet</h2>
      <p className="m-0 leading-[1.55] text-pretty text-muted">
        The dashboard collects what needs you across every project in {workspace}: work waiting for review,
        questions from people and agents, stalled tasks and close deadlines.
      </p>
      <ol className="m-0 grid list-none grid-cols-[repeat(2,minmax(0,300px))] gap-3 p-0">
        <li className="flex flex-col gap-2.5 border border-line bg-surface p-3.5">
          <span className="font-mono text-[10px] text-faint">1</span>
          <b className="font-semibold">Create a project</b>
          <span className="leading-normal text-muted">
            Give it a name and a short key like PAY. Link a repository if you have one.
          </span>
          <Button onPress={onNewProject} className="self-start" kbd="P" aria-keyshortcuts="p">
            New project
          </Button>
        </li>
        <li className="flex flex-col gap-2.5 border border-line bg-surface p-3.5">
          <span className="font-mono text-[10px] text-faint">2</span>
          <b className="font-semibold">Add an agent</b>
          <span className="leading-normal text-muted">
            Agents get an API key and work through the pm command. Their tasks and questions show up here.
          </span>
          <Button variant="secondary" onPress={onAddAgent} className="self-start">
            Add an agent
          </Button>
        </li>
      </ol>
    </div>
  );
}

/** Matches a media query in the browser; false on the server and while hydrating. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {};
      const list = window.matchMedia(query);
      list.addEventListener('change', notify);
      return () => list.removeEventListener('change', notify);
    },
    () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false),
    () => false,
  );
}
