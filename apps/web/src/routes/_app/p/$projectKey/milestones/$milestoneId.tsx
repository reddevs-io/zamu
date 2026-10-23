import { createFileRoute, notFound, redirect } from '@tanstack/react-router';
import { MilestonePage } from '~/features/planning/MilestonePage';
import { prefetchMilestone, settleOnServer } from '~/features/planning/prefetch';
import { parsePlanningTasksSearch } from '~/features/planning/search';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// One milestone and its tasks: /p/PAY/milestones/<id>?status=todo&assignee=me&cycle=current.
export const Route = createFileRoute('/_app/p/$projectKey/milestones/$milestoneId')({
  validateSearch: parsePlanningTasksSearch,
  beforeLoad: ({ params, search }) => {
    if (!UUID.test(params.milestoneId)) throw notFound();
    const upper = params.projectKey.toUpperCase();
    if (upper !== params.projectKey) {
      throw redirect({
        to: '/p/$projectKey/milestones/$milestoneId',
        params: { projectKey: upper, milestoneId: params.milestoneId },
        search,
        replace: true,
      });
    }
  },
  loaderDeps: ({ search }) => search,
  loader: ({ context, params, deps }) =>
    settleOnServer(prefetchMilestone(context.queryClient, params.projectKey, params.milestoneId, deps)),
  head: ({ params }) => ({ meta: [{ title: `Milestone · ${params.projectKey} · project-management` }] }),
  component: MilestoneRoute,
});

function MilestoneRoute() {
  const { projectKey, milestoneId } = Route.useParams();
  const search = Route.useSearch();
  return (
    <MilestonePage key={milestoneId} projectKey={projectKey} milestoneId={milestoneId} search={search} />
  );
}
