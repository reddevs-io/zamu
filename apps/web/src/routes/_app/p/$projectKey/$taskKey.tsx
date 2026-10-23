import { safeParseTaskKey } from '@pm/contracts';
import { createFileRoute, notFound, redirect } from '@tanstack/react-router';
import { prefetchTaskPage, settleOnServer } from '~/features/tasks/prefetch';
import { timelineQuery } from '~/features/tasks/queries';
import { TaskPage } from '~/features/tasks/TaskPage';

// One task on a full page: /p/PAY/PAY-140.
export const Route = createFileRoute('/_app/p/$projectKey/$taskKey')({
  beforeLoad: ({ params }) => {
    const projectKey = params.projectKey.toUpperCase();
    const taskKey = params.taskKey.toUpperCase();
    if (!safeParseTaskKey(taskKey)) throw notFound();
    if (projectKey !== params.projectKey || taskKey !== params.taskKey) {
      throw redirect({ to: '/p/$projectKey/$taskKey', params: { projectKey, taskKey }, replace: true });
    }
  },
  loader: ({ context, params }) =>
    settleOnServer(
      Promise.all([
        prefetchTaskPage(context.queryClient, params.taskKey),
        context.queryClient.prefetchQuery(timelineQuery(params.taskKey)),
      ]),
    ),
  head: ({ params }) => ({ meta: [{ title: `${params.taskKey} · project-management` }] }),
  component: TaskPageRoute,
});

function TaskPageRoute() {
  const { projectKey, taskKey } = Route.useParams();
  return <TaskPage key={taskKey} projectKey={projectKey} taskKey={taskKey} />;
}
