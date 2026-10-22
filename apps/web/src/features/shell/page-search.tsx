import {
  createContext,
  type ReactNode,
  type RefCallback,
  useCallback,
  useContext,
  useMemo,
  useRef,
} from 'react';

// "/" focuses the page's search field. A page registers its field by passing the ref from
// usePageSearchRef() to SearchField's inputRef:
//
//   const searchRef = usePageSearchRef();
//   <SearchField inputRef={searchRef} ... />
//
// Pages that do not register one still work: the shell falls back to the first search input in <main>.
interface PageSearchState {
  register: RefCallback<HTMLInputElement>;
  focus: () => boolean;
}

const PageSearchContext = createContext<PageSearchState | null>(null);

export function PageSearchProvider({ children }: { children: ReactNode }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const register = useCallback<RefCallback<HTMLInputElement>>((node) => {
    inputRef.current = node;
  }, []);
  const focus = useCallback(() => {
    const input =
      (inputRef.current?.isConnected ? inputRef.current : null) ??
      document.querySelector<HTMLInputElement>('main input[type="search"]');
    if (!input) return false;
    input.focus();
    input.select();
    return true;
  }, []);
  const value = useMemo(() => ({ register, focus }), [register, focus]);
  return <PageSearchContext.Provider value={value}>{children}</PageSearchContext.Provider>;
}

/** Ref for the page's search input, so the shell's "/" shortcut can focus it. */
export function usePageSearchRef(): RefCallback<HTMLInputElement> | undefined {
  return useContext(PageSearchContext)?.register;
}

/** Focuses the registered search field (or the first one in <main>); false when there is none. */
export function useFocusPageSearch(): () => boolean {
  const value = useContext(PageSearchContext);
  return value?.focus ?? (() => false);
}
