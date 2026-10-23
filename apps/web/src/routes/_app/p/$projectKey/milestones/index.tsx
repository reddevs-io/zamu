import { createFileRoute, redirect } from '@tanstack/react-router';
import { MilestonesScreen } from '~/features/planning/MilestonesScreen';
import { prefetchMilestones, settleOnServer } from '~/features/planning/prefetch';
import { parseMilestonesSearch } from '~/features/planning/search';

// Milestones of one project: /p/PAY/milestones?status=planned&sort=name.
export const Route = createFileRoute('/_app/p/$projectKey/milestones/')({
  validateSearch: parseMilestonesSearch,
  beforeLoad: ({ params, search }) => {
    const upper = params.projectKey.toUpperCase();
    if (upper !== params.projectKey) {
      throw redirect({
        to: '/p/$projectKey/milestones',
        params: { projectKey: upper },
        search,
        replace: true,
      });
    }
  },
  loader: ({ context, params }) => settleOnServer(prefetchMilestones(context.queryClient, params.projectKey)),
  head: ({ params }) => ({ meta: [{ title: `Milestones · ${params.projectKey} · project-management` }] }),
  component: MilestonesRoute,
});

function MilestonesRoute() {
  const { projectKey } = Route.useParams();
  const search = Route.useSearch();
  return <MilestonesScreen projectKey={projectKey} search={search} />;
}
