import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { BoardScreen } from '~/features/board/BoardScreen';
import { rememberedView } from '~/features/tasks/list-memory';
import { prefetchTaskList, settleOnServer } from '~/features/tasks/prefetch';
import { parseTaskListSearch } from '~/features/tasks/search';
import { TaskListScreen } from '~/features/tasks/TaskListScreen';

// Tasks of one project, as the list (/p/PAY?task=PAY-142) or the board (/p/PAY?view=board).
// Selection, filters and the view are search params. Opening a project without ?view shows the view
// it was last left in (remembered in local storage).
export const Route = createFileRoute('/_app/p/$projectKey/')({
  validateSearch: parseTaskListSearch,
  beforeLoad: ({ params, search }) => {
    const upper = params.projectKey.toUpperCase();
    if (upper !== params.projectKey) {
      throw redirect({ to: '/p/$projectKey', params: { projectKey: upper }, search, replace: true });
    }
    if (search.view === undefined && rememberedView(upper) === 'board') {
      throw redirect({
        to: '/p/$projectKey',
        params: { projectKey: upper },
        search: { ...search, view: 'board' },
        replace: true,
      });
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
  const navigate = useNavigate();

  // The server cannot read local storage: after a full page load of /p/PAY, switch to the
  // remembered board here.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only when entering a project
  useEffect(() => {
    if (search.view === undefined && rememberedView(projectKey) === 'board') {
      void navigate({
        to: '/p/$projectKey',
        params: { projectKey },
        search: { ...search, view: 'board' },
        replace: true,
      });
    }
  }, [projectKey]);

  return search.view === 'board' ? (
    <BoardScreen key={projectKey} projectKey={projectKey} search={search} />
  ) : (
    <TaskListScreen projectKey={projectKey} search={search} />
  );
}
