import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';

// Whether the sidebar shows names or only icons. A person's choice ([ or Toggle sidebar in the palette) is
// kept in localStorage per person. Below 1100px wide the sidebar is collapsed regardless (the 1024 frames);
// [ there opens it for the moment without changing the saved choice.

/** Below this width the sidebar starts collapsed. */
export const NARROW_QUERY = '(max-width: 1099px)';

export function sidebarStorageKey(userId: string): string {
  return `zamu.sidebar.collapsed:${userId}`;
}

function readSaved(userId: string | undefined): boolean {
  if (!userId) return false;
  try {
    return window.localStorage.getItem(sidebarStorageKey(userId)) === '1';
  } catch {
    return false;
  }
}

function save(userId: string | undefined, collapsed: boolean) {
  if (!userId) return;
  try {
    if (collapsed) window.localStorage.setItem(sidebarStorageKey(userId), '1');
    else window.localStorage.removeItem(sidebarStorageKey(userId));
  } catch {
    // Private mode or a full quota: the choice lasts until the page reloads.
  }
}

const narrowMedia = () => (typeof window.matchMedia === 'function' ? window.matchMedia(NARROW_QUERY) : null);

function subscribeNarrow(listener: () => void) {
  const query = narrowMedia();
  query?.addEventListener('change', listener);
  return () => query?.removeEventListener('change', listener);
}

/** True below 1100px wide; false on the server and where matchMedia is missing. */
export function useNarrowViewport(): boolean {
  return useSyncExternalStore(
    subscribeNarrow,
    () => narrowMedia()?.matches ?? false,
    () => false,
  );
}

interface SidebarState {
  collapsed: boolean;
  /** The window is narrow, so collapsed is the default and [ only opens it for now. */
  narrow: boolean;
  toggle: () => void;
}

const SidebarStateContext = createContext<SidebarState | null>(null);

export function SidebarStateProvider({ userId, children }: { userId?: string; children: ReactNode }) {
  const narrow = useNarrowViewport();
  const [saved, setSaved] = useState(false);
  const [openWhileNarrow, setOpenWhileNarrow] = useState(false);
  // localStorage is read after hydration, so the server and the first client render agree.
  useEffect(() => setSaved(readSaved(userId)), [userId]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a width change ends the temporary opening
  useEffect(() => setOpenWhileNarrow(false), [narrow]);

  const toggle = useCallback(() => {
    if (narrow) {
      setOpenWhileNarrow((open) => !open);
      return;
    }
    setSaved((collapsed) => {
      save(userId, !collapsed);
      return !collapsed;
    });
  }, [narrow, userId]);

  const collapsed = narrow ? !openWhileNarrow : saved;
  const value = useMemo(() => ({ collapsed, narrow, toggle }), [collapsed, narrow, toggle]);
  return <SidebarStateContext.Provider value={value}>{children}</SidebarStateContext.Provider>;
}

export function useSidebarState(): SidebarState {
  const value = useContext(SidebarStateContext);
  if (!value) throw new Error('useSidebarState must be used inside SidebarStateProvider');
  return value;
}

/** Sidebar state, or null outside the shell. */
export function useOptionalSidebarState(): SidebarState | null {
  return useContext(SidebarStateContext);
}
