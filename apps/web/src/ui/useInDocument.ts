import { useLayoutEffect, useRef, useState } from 'react';

/**
 * True once `probe` sits in the page. React Aria builds some collections (Tabs) by rendering their whole
 * subtree once more inside a detached <template>; a menu rendered there finds no menu state and throws
 * ("Cannot read properties of null (reading 'collection')"). Render `<span ref={probe} hidden />` until
 * this turns true, then the real content. (Not for content a collection must see, such as a Select's
 * options: those have to render in that hidden pass.)
 */
export function useInDocument() {
  const probe = useRef<HTMLSpanElement>(null);
  const [inDocument, setInDocument] = useState(false);
  useLayoutEffect(() => {
    if (probe.current?.isConnected) setInDocument(true);
  }, []);
  return [probe, inDocument] as const;
}
