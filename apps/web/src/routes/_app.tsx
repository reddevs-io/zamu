import { createFileRoute, Outlet } from '@tanstack/react-router';
import { meQuery, projectsQuery } from '../features/projects/queries';
import { AppShell } from '../features/shell/AppShell';
import { requireSession } from '../lib/session';

// Signed-in layout: the sidebar, the palette and the global shortcuts around every page under routes/_app/.
type SessionContext = Awaited<ReturnType<typeof requireSession>>;

// Last session seen in the browser. Search-only changes on the same page (filters, the selected task)
// reuse it instead of asking the server again; entering a page always re-checks.
let lastBrowserSession: SessionContext | undefined;

export const Route = createFileRoute('/_app')({
  beforeLoad: async ({ location, cause }) => {
    if (typeof window !== 'undefined' && cause === 'stay' && lastBrowserSession) return lastBrowserSession;
    const result = await requireSession({ location });
    if (typeof window !== 'undefined') lastBrowserSession = result;
    return result;
  },
  // Prefetch what the sidebar shows so the first render (and SSR) has it; failures surface in the pages.
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.prefetchQuery(meQuery()),
      context.queryClient.prefetchQuery(projectsQuery()),
    ]);
  },
  component: AppLayout,
});

function AppLayout() {
  const { session } = Route.useRouteContext();
  return (
    <AppShell user={{ id: session.user.id, name: session.user.name }}>
      <Outlet />
    </AppShell>
  );
}
