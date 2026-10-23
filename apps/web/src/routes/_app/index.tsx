import { createFileRoute, redirect } from '@tanstack/react-router';
import { DASHBOARD_HREF } from '../../features/shell/paths';

// "/" opens the dashboard: the page you land on after signing in.
export const Route = createFileRoute('/_app/')({
  beforeLoad: () => {
    throw redirect({ href: DASHBOARD_HREF, replace: true });
  },
});
