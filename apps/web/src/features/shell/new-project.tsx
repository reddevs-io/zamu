import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';

// Open state of the New project dialog. The shell renders the dialog once and opens it on P;
// the projects screen opens it from its buttons.
interface NewProjectState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

const NewProjectContext = createContext<NewProjectState | null>(null);

export function NewProjectProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const open = useCallback(() => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);
  const value = useMemo(() => ({ isOpen, open, close }), [isOpen, open, close]);
  return <NewProjectContext.Provider value={value}>{children}</NewProjectContext.Provider>;
}

export function useNewProject(): NewProjectState {
  const value = useContext(NewProjectContext);
  if (!value) throw new Error('useNewProject must be used inside NewProjectProvider');
  return value;
}
