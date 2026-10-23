import { createFileRoute } from '@tanstack/react-router';
import { DashboardScreen } from '~/features/dashboard/DashboardScreen';
import { prefetchDashboard } from '~/features/dashboard/queries';
import { parseDashboardSearch, scopeOf } from '~/features/dashboard/search';
import { settleOnServer } from '~/features/tasks/prefetch';

// What needs someone now, across every project: /dashboard?scope=everyone&open=review&task=PAY-140.
export const Route = createFileRoute('/_app/dashboard')({
  validateSearch: parseDashboardSearch,
  // Only the scope changes what loads: expanding a group or opening a task never reruns the loader.
  loaderDeps: ({ search }) => ({ scope: scopeOf(search) }),
  loader: ({ context, deps }) => settleOnServer(prefetchDashboard(context.queryClient, deps.scope)),
  head: () => ({ meta: [{ title: 'Dashboard · project-management' }] }),
  component: DashboardRoute,
});

function DashboardRoute() {
  return <DashboardScreen search={Route.useSearch()} />;
}
