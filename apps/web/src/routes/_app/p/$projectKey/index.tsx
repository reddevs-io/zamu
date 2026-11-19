import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { BoardScreen } from '~/features/board/BoardScreen';
import { rememberedView } from '~/features/tasks/list-memory';
import { prefetchTaskList, settleOnServer } from '~/features/tasks/prefetch';
import { parseTaskListSearch, taskLinkRedirect } from '~/features/tasks/search';
import { TaskListScreen } from '~/features/tasks/TaskListScreen';

// Tasks of one project, as the list (/p/PAY) or the board (/p/PAY?view=board). Filters and the view are
// search params. Opening a project without ?view shows the view it was last left in (remembered in local
// storage). M1–M4 links to a selected task (/p/PAY?task=PAY-142) open that task's view.
export const Route = createFileRoute('/_app/p/$projectKey/')({
  validateSearch: parseTaskListSearch,
  beforeLoad: ({ params, search }) => {
    const upper = params.projectKey.toUpperCase();
    if (upper !== params.projectKey) {
      throw redirect({ to: '/p/$projectKey', params: { projectKey: upper }, search, replace: true });
    }
    // The list and the board have no detail pane any more: ?task= opens the task view.
    const taskLink = taskLinkRedirect(upper, search);
    if (taskLink) throw redirect({ ...taskLink, replace: true });
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
  head: ({ params }) => ({ meta: [{ title: `${params.projectKey} · Zamu` }] }),
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
