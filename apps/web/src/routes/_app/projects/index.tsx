import { createFileRoute } from '@tanstack/react-router';
import { ProjectsPage } from '../../../features/projects/ProjectsPage';
import { meQuery, projectsQuery } from '../../../features/projects/queries';

export const Route = createFileRoute('/_app/projects/')({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.prefetchQuery(projectsQuery()),
      context.queryClient.prefetchQuery(meQuery()),
    ]);
  },
  head: () => ({ meta: [{ title: 'Projects · project-management' }] }),
  component: ProjectsPage,
});
