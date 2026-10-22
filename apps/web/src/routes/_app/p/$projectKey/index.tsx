import { createFileRoute, redirect } from '@tanstack/react-router';
import { prefetchTaskList, settleOnServer } from '~/features/tasks/prefetch';
import { parseTaskListSearch } from '~/features/tasks/search';
import { TaskListScreen } from '~/features/tasks/TaskListScreen';

// Task list of one project: /p/PAY?task=PAY-142. Selection and filters are search params.
export const Route = createFileRoute('/_app/p/$projectKey/')({
  validateSearch: parseTaskListSearch,
  beforeLoad: ({ params, search }) => {
    const upper = params.projectKey.toUpperCase();
    if (upper !== params.projectKey) {
      throw redirect({ to: '/p/$projectKey', params: { projectKey: upper }, search, replace: true });
    }
  },
  loaderDeps: ({ search }) => search,
  loader: ({ context, params, deps }) =>
    settleOnServer(prefetchTaskList(context.queryClient, params.projectKey, deps)),
  head: ({ params }) => ({ meta: [{ title: `${params.projectKey} · project-management` }] }),
  component: TaskListRoute,
});

function TaskListRoute() {
  const { projectKey } = Route.useParams();
  const search = Route.useSearch();
  return <TaskListScreen projectKey={projectKey} search={search} />;
}
