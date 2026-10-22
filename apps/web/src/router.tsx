import { QueryClient } from '@tanstack/react-query';
import { createRouter } from '@tanstack/react-router';
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query';
import { routeTree } from './routeTree.gen';

export type RouterContext = {
  queryClient: QueryClient;
};

export function getRouter() {
  const queryClient = new QueryClient({
    defaultOptions: {
      // M1 has no real-time updates: data refetches on window focus and every 30 seconds.
      queries: { staleTime: 10_000, refetchOnWindowFocus: true, refetchInterval: 30_000 },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient } satisfies RouterContext,
    scrollRestoration: true,
    defaultPreload: 'intent',
    // Let TanStack Query decide freshness for preloaded data.
    defaultPreloadStaleTime: 0,
  });

  setupRouterSsrQueryIntegration({ router, queryClient });

  return router;
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
