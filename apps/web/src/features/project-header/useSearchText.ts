import { useEffect, useRef, useState } from 'react';

const SEARCH_DEBOUNCE_MS = 200;

/**
 * Text of a search box that lives in the URL (?q=): typing updates the box at once and the URL after a
 * short pause; back/forward or a link changing q updates the box. `push` receives undefined for
 * blank text.
 */
export function useSearchText(urlValue: string | undefined, push: (q: string | undefined) => void) {
  const [text, setText] = useState(urlValue ?? '');
  const lastPushed = useRef(urlValue ?? '');
  const pushRef = useRef(push);
  pushRef.current = push;

  useEffect(() => {
    if ((urlValue ?? '') !== lastPushed.current) {
      lastPushed.current = urlValue ?? '';
      setText(urlValue ?? '');
    }
  }, [urlValue]);

  useEffect(() => {
    if (text === lastPushed.current) return;
    const timer = setTimeout(() => {
      lastPushed.current = text;
      pushRef.current(text.trim() ? text : undefined);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text]);

  /** Empties the box without pushing (the caller clears the URL itself). */
  const reset = () => {
    setText('');
    lastPushed.current = '';
  };

  return [text, setText, reset] as const;
}
