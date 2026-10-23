import { createFileRoute, redirect } from '@tanstack/react-router';
import { CyclesScreen } from '~/features/planning/CyclesScreen';
import { prefetchCycles, settleOnServer } from '~/features/planning/prefetch';

// Cycles of one project: /p/PAY/cycles.
export const Route = createFileRoute('/_app/p/$projectKey/cycles/')({
  beforeLoad: ({ params }) => {
    const upper = params.projectKey.toUpperCase();
    if (upper !== params.projectKey) {
      throw redirect({ to: '/p/$projectKey/cycles', params: { projectKey: upper }, replace: true });
    }
  },
  loader: ({ context, params }) => settleOnServer(prefetchCycles(context.queryClient, params.projectKey)),
  head: ({ params }) => ({ meta: [{ title: `Cycles · ${params.projectKey} · project-management` }] }),
  component: CyclesRoute,
});

function CyclesRoute() {
  const { projectKey } = Route.useParams();
  return <CyclesScreen projectKey={projectKey} />;
}
