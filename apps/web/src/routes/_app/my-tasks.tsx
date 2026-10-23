import { createFileRoute } from '@tanstack/react-router';
import { MyTasksScreen } from '~/features/my-tasks/MyTasksScreen';
import { prefetchMyTasks } from '~/features/my-tasks/prefetch';
import { filtersOf, parseMyTasksSearch } from '~/features/my-tasks/search';
import { settleOnServer } from '~/features/tasks/prefetch';

// Tasks assigned to the caller across every readable project: /my-tasks?task=WEB-88&status=todo.
export const Route = createFileRoute('/_app/my-tasks')({
  validateSearch: parseMyTasksSearch,
  // The selection is not a loader dependency: moving it never reruns the loader.
  loaderDeps: ({ search }) => filtersOf(search),
  loader: ({ context, deps }) => settleOnServer(prefetchMyTasks(context.queryClient, deps)),
  head: () => ({ meta: [{ title: 'My tasks · project-management' }] }),
  component: MyTasksRoute,
});

function MyTasksRoute() {
  return <MyTasksScreen search={Route.useSearch()} />;
}
