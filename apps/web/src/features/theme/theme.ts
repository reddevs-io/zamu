import type { Me, Theme } from '@pm/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { client, orpc } from '~/lib/orpc';

// The signed-in person's theme. It lives on the account (GET /me user.theme, PATCH /me { theme }), and the
// page reads it from the cached me.get query: the signed-in layout prefetches that query, so it is in the
// cache when the server renders <html>, and the class is in the first HTML response (no flash on reload).
// Signed-out pages have no me in the cache and follow the system.

/** Class on <html>: "light" or "dark" forces that theme; none follows prefers-color-scheme. */
export function themeClass(theme: Theme | undefined): 'light' | 'dark' | undefined {
  return theme === 'light' || theme === 'dark' ? theme : undefined;
}

/** Content of <meta name="color-scheme">, so form controls and scrollbars match before CSS loads. */
export function colorSchemeFor(theme: Theme | undefined): 'light' | 'dark' | 'light dark' {
  return themeClass(theme) ?? 'light dark';
}

/** The me.get cache, read without fetching (signed-out pages must not call /me). */
const cachedMe = () => ({ ...orpc.me.get.queryOptions(), enabled: false });

/** The signed-in person's theme from the cache; undefined when signed out or not loaded yet. */
export function useUserTheme(): Theme | undefined {
  return useQuery({ ...cachedMe(), select: (me) => me.user.theme }).data;
}

function withTheme(me: Me, theme: Theme): Me {
  return { ...me, user: { ...me.user, theme } };
}

/**
 * Saves a theme choice. The page switches at once (the cached me changes before the request) and goes
 * back when the server refuses; `error` then explains why.
 */
export function useSetTheme() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: orpc.me.update.mutationKey(),
    mutationFn: (theme: Theme) => client.me.update({ theme }),
    onMutate: async (theme) => {
      const queryKey = orpc.me.get.key();
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueriesData<Me>({ queryKey });
      queryClient.setQueriesData<Me>({ queryKey }, (me) => (me ? withTheme(me, theme) : me));
      return { previous };
    },
    onError: (_error, _theme, context) => {
      for (const [queryKey, data] of context?.previous ?? []) queryClient.setQueryData(queryKey, data);
    },
    onSuccess: (me) => {
      queryClient.setQueriesData<Me>({ queryKey: orpc.me.get.key() }, me);
    },
  });
}

// ---- System preference --------------------------------------------------------------------------

const DARK_QUERY = '(prefers-color-scheme: dark)';

// matchMedia is missing in some test environments; System then reads as unknown.
const media = () => (typeof window.matchMedia === 'function' ? window.matchMedia(DARK_QUERY) : null);

function subscribeSystem(listener: () => void) {
  const query = media();
  query?.addEventListener('change', listener);
  return () => query?.removeEventListener('change', listener);
}

function systemSnapshot(): 'light' | 'dark' | null {
  const query = media();
  if (!query) return null;
  return query.matches ? 'dark' : 'light';
}

/** What System resolves to right now; null on the server and while hydrating. */
export function useSystemTheme(): 'light' | 'dark' | null {
  return useSyncExternalStore(subscribeSystem, systemSnapshot, () => null);
}
