import type { TaskStatus } from '@pm/contracts';
import { createContext, type ReactNode, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Toast } from '~/ui';

// Shared state for the quick create dialog. The shell (M1-10) renders the provider and opens it on C;
// the task screens (M1-11) render the dialog and read the state.
//
// M3: a project whose tasks come from Backlog.md takes no new tasks here. The shell passes `refuse`;
// open() in such a project shows the refusal as a toast instead of the dialog (C, New, "+" on the
// board, New task on milestone and cycle pages).

/** Prefills for one opening of the dialog; the next open() without them starts from the defaults. */
export interface QuickCreateOptions {
  /** Status to preselect, e.g. the board column whose "+" opened the dialog. */
  status?: TaskStatus;
  /**
   * Open with no project chosen and the project picker focused, instead of guessing the most recently
   * active project (the dashboard covers every project, so there is no good guess).
   */
  pickProject?: boolean;
}

interface QuickCreateState {
  isOpen: boolean;
  /** Project to create the task in; undefined lets the dialog pick (current or most recent project). */
  projectKey: string | undefined;
  /** Status to preselect for this opening; undefined uses the dialog's default. */
  status: TaskStatus | undefined;
  /** Why the last open() did nothing (a mirrored project); null otherwise. */
  refusal: string | null;
  /** This opening starts without a project; the dialog focuses its project picker. */
  pickProject: boolean;
  open: (projectKey?: string, options?: QuickCreateOptions) => void;
  close: () => void;
}

const QuickCreateContext = createContext<QuickCreateState | null>(null);

/** How long the refusal toast stays. */
export const REFUSAL_TOAST_MS = 8_000;

export interface QuickCreateProviderProps {
  children: ReactNode;
  /**
   * Returns why tasks can't be created in a project (it mirrors Backlog.md), or null when they can.
   * Called on every open() with a project key.
   */
  refuse?: (projectKey: string) => string | null;
}

export function QuickCreateProvider({ children, refuse }: QuickCreateProviderProps) {
  const [isOpen, setOpen] = useState(false);
  const [projectKey, setProjectKey] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<TaskStatus | undefined>(undefined);
  const [refusal, setRefusal] = useState<{ id: number; text: string } | null>(null);
  const refuseRef = useRef(refuse);
  refuseRef.current = refuse;
  const toastId = useRef(0);
  const [pickProject, setPickProject] = useState(false);
  const open = useCallback((key?: string, options?: QuickCreateOptions) => {
    const reason = key ? (refuseRef.current?.(key) ?? null) : null;
    if (reason) {
      toastId.current++;
      setRefusal({ id: toastId.current, text: reason });
      return;
    }
    setRefusal(null);
    setProjectKey(key);
    setStatus(options?.status);
    setPickProject(key === undefined && options?.pickProject === true);
    setOpen(true);
  }, []);
  const close = useCallback(() => setOpen(false), []);
  const refusalText = refusal?.text ?? null;
  const value = useMemo(
    () => ({ isOpen, projectKey, status, pickProject, refusal: refusalText, open, close }),
    [isOpen, projectKey, status, pickProject, refusalText, open, close],
  );
  return (
    <QuickCreateContext.Provider value={value}>
      {children}
      {refusal ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-5 z-50 flex justify-center px-6">
          <Toast
            key={refusal.id}
            timeout={REFUSAL_TOAST_MS}
            onDismiss={() => setRefusal(null)}
            className="pointer-events-auto max-w-[560px] whitespace-normal"
          >
            {refusal.text}
          </Toast>
        </div>
      ) : null}
    </QuickCreateContext.Provider>
  );
}

export function useQuickCreate(): QuickCreateState {
  const value = useContext(QuickCreateContext);
  if (!value) throw new Error('useQuickCreate must be used inside QuickCreateProvider');
  return value;
}

/** Quick create state, or null outside a QuickCreateProvider (screens rendered without the shell). */
export function useOptionalQuickCreate(): QuickCreateState | null {
  return useContext(QuickCreateContext);
}
