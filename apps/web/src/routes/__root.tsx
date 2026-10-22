/// <reference types="vite/client" />
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { requireSetUp } from '../lib/session';
import type { RouterContext } from '../router';
import appCss from '../styles/app.css?url';
import { UIProvider } from '../ui/UIProvider';

export const Route = createRootRouteWithContext<RouterContext>()({
  // Sends every page to /setup until the first admin and workspace exist.
  beforeLoad: ({ location }) => requireSetUp({ location }),
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      // The UI follows the system theme (prefers-color-scheme).
      { name: 'color-scheme', content: 'light dark' },
      { title: 'project-management' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <RootDocument>
      <UIProvider>
        <Outlet />
      </UIProvider>
    </RootDocument>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
