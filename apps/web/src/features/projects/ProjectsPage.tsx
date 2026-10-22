import { useQuery } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { useDeferredValue, useMemo, useState } from 'react';
import { useNewProject } from '~/features/shell/new-project';
import { usePageSearchRef } from '~/features/shell/page-search';
import { projectHref } from '~/features/shell/paths';
import {
  Banner,
  Button,
  EmptyState,
  FilterBar,
  OPEN_STATUSES,
  PageHeader,
  SearchField,
  StatusSquare,
} from '~/ui';
import { byLastActivity, filterProjects } from './order';
import { ProjectsTable } from './ProjectsTable';
import { meQuery, projectsQuery } from './queries';

function subtitle(count: number | undefined, workspace: string | undefined): string {
  if (!workspace) return count === undefined ? '' : `${count} ${count === 1 ? 'project' : 'projects'}`;
  if (count === undefined) return `${workspace} workspace`;
  if (count === 0) return `${workspace} workspace`;
  return `${count} ${count === 1 ? 'project' : 'projects'} in ${workspace}`;
}

function Legend() {
  return (
    <span className="flex items-center gap-3.5 text-[11.5px]">
      {OPEN_STATUSES.map((status) => (
        <StatusSquare key={status} status={status} withLabel />
      ))}
    </span>
  );
}

/** /projects: every project in the workspace, most recently updated first (frames 03). */
export function ProjectsPage() {
  const router = useRouter();
  const projects = useQuery(projectsQuery());
  const me = useQuery(meQuery());
  const newProject = useNewProject();
  const searchRef = usePageSearchRef();
  const [search, setSearch] = useState('');
  const query = useDeferredValue(search);

  const sorted = useMemo(() => byLastActivity(projects.data?.items ?? []), [projects.data]);
  const visible = useMemo(() => filterProjects(sorted, query), [sorted, query]);
  const count = projects.data?.items.length;
  const isEmpty = count === 0;

  const openProject = (key: string) => void router.navigate({ href: projectHref(key) });
  const newProjectButton = (
    <Button kbd="P" aria-keyshortcuts="P" onPress={newProject.open}>
      New project
    </Button>
  );

  return (
    <section className="flex min-h-0 flex-1 flex-col" aria-label="Projects">
      <PageHeader
        title="Projects"
        subtitle={subtitle(count, me.data?.workspace.name)}
        actions={
          <>
            <SearchField
              aria-label="Search projects"
              inputRef={searchRef}
              value={search}
              onChange={setSearch}
              aria-keyshortcuts="/"
            />
            {newProjectButton}
          </>
        }
      />
      {projects.isError && !projects.data ? (
        <div className="px-6 py-4">
          <Banner
            action={
              <Button variant="secondary" size="sm" onPress={() => void projects.refetch()}>
                Retry
              </Button>
            }
          >
            Couldn't load projects. Check your connection and try again.
          </Banner>
        </div>
      ) : isEmpty ? (
        <div className="flex flex-1 items-center px-24">
          <EmptyState
            title="No projects yet"
            text="A project holds tasks. Each one gets a short key that prefixes its task IDs, like PAY-42."
            action={newProjectButton}
            cli={{ label: 'Or from the CLI', command: 'pm projects create --name "Payments" --key PAY' }}
          />
        </div>
      ) : (
        <>
          <FilterBar end="Sorted by last update">
            <Legend />
          </FilterBar>
          <ProjectsTable
            projects={visible}
            isLoading={projects.isPending}
            emptyMessage={query.trim() ? `No projects match “${query.trim()}”.` : undefined}
            onOpen={openProject}
          />
        </>
      )}
    </section>
  );
}
