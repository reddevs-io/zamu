import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useHotkeys } from '~/ui';

// Focus and multi-select of tasks in a list, a board or Home (shortcuts.md "Lists and boards"):
//   J / K, ↓ / ↑        move the focus (the row or card the keys act on)
//   X                   select or unselect the focused task
//   Shift+↓ / Shift+↑   extend the selection from where it started
//   Shift+click         select the range from the last selected task to this one
//   ⌘/Ctrl+click        add or remove one task
//   ⌘A                  select every task in the view
//   Esc                 clear the selection; with nothing selected, drop the focus
// Single keys never fire in text fields, and none of them inside an open menu, dialog or picker
// (useHotkeys), so Esc closes the topmost layer first.
//
// The view mounting the hook publishes its selection (useCurrentTaskSelection), so the action bar
// and the palette commands act on it without props.

export interface TaskSelectionOptions {
  /** Mount the keys above (default true). Off while the peek or a dialog owns the keyboard. */
  hotkeys?: boolean;
  /** Also bind ↑ / ↓ (default true). Off when the view's grid moves on arrows itself. */
  arrowKeys?: boolean;
  /** Focus on mount, for example the task the person came back from (Esc in the task view). */
  initialFocus?: string | null;
  /** The focus moved (scroll the row into view, sync the URL). */
  onFocusChange?: (key: string | null) => void;
  /** Esc with nothing selected and nothing focused: leave the view (blur, or go back). */
  onEscapeEmpty?: () => void;
  /** Name published with the selection: "List", "Board", "Home". */
  view?: string;
}

export interface ClickModifiers {
  shiftKey?: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
}

export interface TaskSelection {
  /** The row or card keys act on; null when none. */
  focusedKey: string | null;
  /** Selected keys, in view order. */
  selectedKeys: readonly string[];
  /** What task actions apply to: the selection, else the focused task, else nothing. */
  targetKeys: readonly string[];
  isSelected: (key: string) => boolean;
  focus: (key: string | null) => void;
  /** Next (1) or previous (-1) task; from nothing, the first or last. */
  moveFocus: (delta: 1 | -1) => void;
  /** X: select or unselect a task (default: the focused one). */
  toggle: (key?: string) => void;
  /** Shift+↓ / Shift+↑. */
  extend: (delta: 1 | -1) => void;
  /** Shift+click: the range from the anchor to `key`. */
  selectRange: (key: string) => void;
  selectAll: () => void;
  /** Replace the selection. */
  setSelected: (keys: Iterable<string>) => void;
  clear: () => void;
  /** Esc: clears the selection, else the focus, else calls onEscapeEmpty. True when it did something. */
  escape: () => boolean;
  /**
   * A row or card was clicked. Shift selects a range, ⌘/Ctrl toggles; both return true (the
   * screen should then not open the task). A plain click focuses the task and returns false.
   */
  handleClick: (key: string, modifiers: ClickModifiers) => boolean;
}

/** Range of `keys` between two keys, both included, in view order. */
function rangeOf(keys: readonly string[], from: string, to: string): string[] {
  const a = keys.indexOf(from);
  const b = keys.indexOf(to);
  if (a < 0 || b < 0) return b >= 0 ? [to] : [];
  return keys.slice(Math.min(a, b), Math.max(a, b) + 1);
}

/** Focus and selection over `orderedKeys` (the tasks as the view shows them, top to bottom). */
export function useTaskSelection(
  orderedKeys: readonly string[],
  options: TaskSelectionOptions = {},
): TaskSelection {
  const { hotkeys = true, arrowKeys = true, initialFocus = null, view } = options;
  const [focusedKey, setFocusedKey] = useState<string | null>(initialFocus);
  const [selected, setSelectedState] = useState<ReadonlySet<string>>(() => new Set());

  // Key presses can come faster than renders: handlers read and write refs, then set state.
  const keysRef = useRef(orderedKeys);
  keysRef.current = orderedKeys;
  const focusRef = useRef(focusedKey);
  const selectedRef = useRef(selected);
  /** Where a Shift range starts, the selection it adds to, and where it last ended. */
  const anchorRef = useRef<{ key: string; base: ReadonlySet<string>; end: string } | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const applyFocus = useCallback((key: string | null) => {
    if (focusRef.current === key) return;
    focusRef.current = key;
    setFocusedKey(key);
    optionsRef.current.onFocusChange?.(key);
  }, []);

  const applySelected = useCallback((next: ReadonlySet<string>) => {
    selectedRef.current = next;
    setSelectedState(next);
  }, []);

  // Tasks that left the view (filtered out, deleted) leave the selection and the focus.
  const keySet = useMemo(() => new Set(orderedKeys), [orderedKeys]);
  useEffect(() => {
    const current = selectedRef.current;
    if ([...current].some((key) => !keySet.has(key))) {
      applySelected(new Set([...current].filter((key) => keySet.has(key))));
    }
    if (focusRef.current && !keySet.has(focusRef.current) && orderedKeys.length > 0) applyFocus(null);
    if (anchorRef.current && !keySet.has(anchorRef.current.key)) anchorRef.current = null;
  }, [keySet, orderedKeys.length, applyFocus, applySelected]);

  const focus = useCallback((key: string | null) => applyFocus(key), [applyFocus]);

  const moveFocus = useCallback(
    (delta: 1 | -1) => {
      const keys = keysRef.current;
      if (keys.length === 0) return;
      const index = focusRef.current ? keys.indexOf(focusRef.current) : -1;
      const next =
        index < 0 ? (delta > 0 ? 0 : keys.length - 1) : Math.min(keys.length - 1, Math.max(0, index + delta));
      applyFocus(keys[next] ?? null);
    },
    [applyFocus],
  );

  const toggle = useCallback(
    (key?: string) => {
      const target = key ?? focusRef.current;
      if (!target) return;
      const next = new Set(selectedRef.current);
      if (next.has(target)) next.delete(target);
      else next.add(target);
      applySelected(next);
      anchorRef.current = { key: target, base: next, end: target };
      if (key) applyFocus(key);
    },
    [applyFocus, applySelected],
  );

  const selectRange = useCallback(
    (key: string) => {
      const keys = keysRef.current;
      const start =
        anchorRef.current?.key ??
        (focusRef.current && keys.includes(focusRef.current) ? focusRef.current : key);
      const base = anchorRef.current?.base ?? selectedRef.current;
      anchorRef.current = { key: start, base, end: key };
      applySelected(new Set([...base, ...rangeOf(keys, start, key)]));
      applyFocus(key);
    },
    [applyFocus, applySelected],
  );

  const extend = useCallback(
    (delta: 1 | -1) => {
      const keys = keysRef.current;
      if (keys.length === 0) return;
      const from = focusRef.current;
      if (!from || !keys.includes(from)) {
        moveFocus(delta);
        const first = focusRef.current;
        if (first) {
          const next = new Set(selectedRef.current).add(first);
          anchorRef.current = { key: first, base: selectedRef.current, end: first };
          applySelected(next);
        }
        return;
      }
      // A new Shift run starts at the focused task (when the focus moved since the last range), on
      // top of what is selected now.
      if (!anchorRef.current || anchorRef.current.end !== from) {
        anchorRef.current = { key: from, base: selectedRef.current, end: from };
      }
      const index = keys.indexOf(from);
      const to = keys[Math.min(keys.length - 1, Math.max(0, index + delta))] ?? from;
      selectRange(to);
    },
    [applySelected, moveFocus, selectRange],
  );

  const selectAll = useCallback(() => {
    anchorRef.current = null;
    applySelected(new Set(keysRef.current));
  }, [applySelected]);

  const setSelected = useCallback(
    (keys: Iterable<string>) => {
      anchorRef.current = null;
      applySelected(new Set(keys));
    },
    [applySelected],
  );

  const clear = useCallback(() => {
    anchorRef.current = null;
    if (selectedRef.current.size) applySelected(new Set());
  }, [applySelected]);

  const escapeKey = useCallback(() => {
    if (selectedRef.current.size) {
      clear();
      return true;
    }
    if (focusRef.current) {
      applyFocus(null);
      return true;
    }
    if (optionsRef.current.onEscapeEmpty) {
      optionsRef.current.onEscapeEmpty();
      return true;
    }
    return false;
  }, [applyFocus, clear]);

  const handleClick = useCallback(
    (key: string, modifiers: ClickModifiers) => {
      if (modifiers.shiftKey) {
        selectRange(key);
        return true;
      }
      if (modifiers.metaKey || modifiers.ctrlKey) {
        toggle(key);
        return true;
      }
      anchorRef.current = null;
      applyFocus(key);
      return false;
    },
    [applyFocus, selectRange, toggle],
  );

  useHotkeys(
    {
      j: () => moveFocus(1),
      k: () => moveFocus(-1),
      ArrowDown: arrowKeys ? () => moveFocus(1) : null,
      ArrowUp: arrowKeys ? () => moveFocus(-1) : null,
      'Shift+ArrowDown': () => extend(1),
      'Shift+ArrowUp': () => extend(-1),
      x: () => toggle(),
      // In a text field ⌘A selects its text.
      'Mod+a': { handler: () => selectAll(), allowInInputs: false },
      Escape: {
        handler: (event) => {
          if (escapeKey()) event.preventDefault();
        },
        // Esc with nothing to clear is left to whoever handles it next.
        preventDefault: false,
      },
    },
    { enabled: hotkeys },
  );

  const selectedKeys = useMemo(() => orderedKeys.filter((key) => selected.has(key)), [orderedKeys, selected]);
  const targetKeys = useMemo(
    () => (selectedKeys.length ? selectedKeys : focusedKey && keySet.has(focusedKey) ? [focusedKey] : []),
    [selectedKeys, focusedKey, keySet],
  );
  const isSelected = useCallback((key: string) => selected.has(key), [selected]);

  // Publish for the action bar and the palette.
  useEffect(() => {
    publish({ view: view ?? null, focusedKey, selectedKeys, targetKeys });
  }, [view, focusedKey, selectedKeys, targetKeys]);
  useEffect(() => () => publish(EMPTY), []);

  return {
    focusedKey,
    selectedKeys,
    targetKeys,
    isSelected,
    focus,
    moveFocus,
    toggle,
    extend,
    selectRange,
    selectAll,
    setSelected,
    clear,
    escape: escapeKey,
    handleClick,
  };
}

// ---------------------------------------------------------------------------
// The current view's selection, for the action bar and palette commands
// ---------------------------------------------------------------------------

export interface CurrentTaskSelection {
  /** "List", "Board", "Home"; null when no view is mounted. */
  view: string | null;
  focusedKey: string | null;
  selectedKeys: readonly string[];
  /** The selection, else the focused task. */
  targetKeys: readonly string[];
}

const EMPTY: CurrentTaskSelection = { view: null, focusedKey: null, selectedKeys: [], targetKeys: [] };
let current: CurrentTaskSelection = EMPTY;
const listeners = new Set<() => void>();

function publish(next: CurrentTaskSelection) {
  current = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The mounted view's focus and selection (empty when none). Re-renders when it changes. */
export function useCurrentTaskSelection(): CurrentTaskSelection {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => EMPTY,
  );
}

/** The same, read once (inside a command's run()). */
export function getCurrentTaskSelection(): CurrentTaskSelection {
  return current;
}
