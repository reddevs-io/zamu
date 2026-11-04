import { createFileRoute, redirect } from '@tanstack/react-router';
import { MilestonesScreen } from '~/features/planning/MilestonesScreen';
import { prefetchMilestones, settleOnServer } from '~/features/planning/prefetch';

// Milestones of one project: /p/PAY/milestones.
export const Route = createFileRoute('/_app/p/$projectKey/milestones/')({
  beforeLoad: ({ params }) => {
    const upper = params.projectKey.toUpperCase();
    if (upper !== params.projectKey) {
      throw redirect({ to: '/p/$projectKey/milestones', params: { projectKey: upper }, replace: true });
    }
  },
  loader: ({ context, params }) => settleOnServer(prefetchMilestones(context.queryClient, params.projectKey)),
  head: ({ params }) => ({ meta: [{ title: `Milestones · ${params.projectKey} · project-management` }] }),
  component: MilestonesRoute,
});

function MilestonesRoute() {
  const { projectKey } = Route.useParams();
  return <MilestonesScreen projectKey={projectKey} />;
}
