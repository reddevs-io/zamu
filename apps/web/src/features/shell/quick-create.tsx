import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';

// Shared state for the quick create dialog. The shell (M1-10) renders the provider and opens it on C;
// the task screens (M1-11) render the dialog and read the state.
interface QuickCreateState {
  isOpen: boolean;
  /** Project to create the task in; undefined lets the dialog pick (current or most recent project). */
  projectKey: string | undefined;
  open: (projectKey?: string) => void;
  close: () => void;
}

const QuickCreateContext = createContext<QuickCreateState | null>(null);

export function QuickCreateProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const [projectKey, setProjectKey] = useState<string | undefined>(undefined);
  const open = useCallback((key?: string) => {
    setProjectKey(key);
    setOpen(true);
  }, []);
  const close = useCallback(() => setOpen(false), []);
  const value = useMemo(() => ({ isOpen, projectKey, open, close }), [isOpen, projectKey, open, close]);
  return <QuickCreateContext.Provider value={value}>{children}</QuickCreateContext.Provider>;
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
