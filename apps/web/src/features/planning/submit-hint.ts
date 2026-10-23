import { useEffect, useState } from 'react';

/** "⌘↵" on Apple platforms, "Ctrl↵" elsewhere. Read after mount: the server cannot know. */
export function useSubmitHint(): string {
  const [hint, setHint] = useState('⌘↵');
  useEffect(() => {
    const platform =
      (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ??
      navigator.platform ??
      '';
    if (!/mac|iphone|ipad|ipod/i.test(platform || navigator.userAgent)) setHint('Ctrl↵');
  }, []);
  return hint;
}
