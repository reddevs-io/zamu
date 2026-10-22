import { createFileRoute, Outlet } from '@tanstack/react-router';
import { meQuery } from '~/features/settings/queries';
import { SettingsLayout } from '~/features/settings/SettingsLayout';

// Settings area: settings nav plus the current page, inside the signed-in shell.
export const Route = createFileRoute('/_app/settings')({
  loader: ({ context }) => context.queryClient.prefetchQuery(meQuery()),
  component: SettingsRoute,
});

function SettingsRoute() {
  return (
    <SettingsLayout>
      <Outlet />
    </SettingsLayout>
  );
}
