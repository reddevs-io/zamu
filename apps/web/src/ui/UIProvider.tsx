import { useRouter } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { RouterProvider } from 'react-aria-components';

/**
 * Makes React Aria links (Rail, SettingsNav, MenuItem with href) navigate through TanStack Router
 * instead of reloading the page. Render it once inside the router, around the signed-in layout.
 */
export function UIProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  return (
    <RouterProvider
      navigate={(href) => {
        void router.navigate({ href });
      }}
      useHref={(href) => href}
    >
      {children}
    </RouterProvider>
  );
}
