import { useCallback, useEffect, useRef, useState } from 'react';

// The selected task lives in the URL (?task=PAY-142), but writing the URL is a router navigation, and
// signed-in navigations run guards that may call the server. So the selection is local state that the
// table and the pane read at once; it reaches the URL shortly after J/K stops, and follows the URL when
// something else changes it (back/forward, a link, quick create).
//
// Our own URL writes come back later, possibly after newer key presses and possibly out of order. They
// must never pull the selection back, so every value written is remembered until the URL shows it.

const PUSH_DELAY_MS = 150;
const NONE = '\u0000none';

const token = (value: string | null) => value ?? NONE;

export function useUrlSelection(urlValue: string | null, push: (value: string | null) => void) {
  const [value, setValue] = useState(urlValue);
  /** The most recently requested selection, updated synchronously (before React re-renders). */
  const selectedRef = useRef(urlValue);
  /** Values written to the URL that the URL has not shown yet, oldest first. */
  const inFlight = useRef<string[]>([]);
  const lastUrl = useRef(urlValue);
  const pushRef = useRef(push);
  pushRef.current = push;

  const select = useCallback((next: string | null) => {
    selectedRef.current = next;
    setValue(next);
  }, []);

  useEffect(() => {
    if (urlValue === lastUrl.current) return;
    lastUrl.current = urlValue;
    const index = inFlight.current.indexOf(token(urlValue));
    if (index >= 0) {
      // Our own write arriving: drop it and anything older. The selection already moved on.
      inFlight.current = inFlight.current.slice(index + 1);
      return;
    }
    // Changed elsewhere: follow it.
    inFlight.current = [];
    selectedRef.current = urlValue;
    setValue(urlValue);
  }, [urlValue]);

  // Write the selection to the URL once it settles.
  useEffect(() => {
    if (value === lastUrl.current && inFlight.current.length === 0) return;
    const timer = setTimeout(() => {
      if (value === lastUrl.current && inFlight.current.length === 0) return;
      inFlight.current.push(token(value));
      pushRef.current(value);
    }, PUSH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [value]);

  /** Call when another URL write (a filter change) carries the current selection along. */
  const noteWrite = useCallback((written: string | null) => {
    if (written !== lastUrl.current) inFlight.current.push(token(written));
  }, []);

  return { selected: value, select, selectedRef, noteWrite };
}
