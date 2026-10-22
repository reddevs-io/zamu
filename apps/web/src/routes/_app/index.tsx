import { createFileRoute, redirect } from '@tanstack/react-router';
import { latestProjectKey } from '../../features/projects/order';
import { projectsQuery } from '../../features/projects/queries';
import { PROJECTS_HREF, projectHref } from '../../features/shell/paths';

// "/" opens the most recently updated project's task list, or /projects when there is none.
export const Route = createFileRoute('/_app/')({
  loader: async ({ context }) => {
    // On a failed load, /projects shows the error and a retry.
    const items = await context.queryClient
      .fetchQuery(projectsQuery())
      .then((list) => list.items)
      .catch(() => []);
    const key = latestProjectKey(items);
    throw redirect({ href: key ? projectHref(key) : PROJECTS_HREF, replace: true });
  },
});
