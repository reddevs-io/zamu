import type { ProjectWithCounts } from '@pm/contracts';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { retryOnce } from '~/features/tasks/errors';
import { projectsQuery } from '~/features/tasks/queries';
import { orpc } from '~/lib/orpc';
import { FilterBar, PageHeader, ViewTabs } from '~/ui';
import { type ProjectView, projectTabs } from './tabs';

// Shared header of a project's pages (tasks list and board, milestones, cycles):
//
//   Payments                                        [Search /] [New C]
//   PAY · 12 open · board
//   Tasks 12   ◇ Milestones 3   ◑ Cycles C12 · 3d left          (only when milestones or cycles are on)
//   Status Any  Priority Any  …                       [List|Board] V   (only when `filters` is given)

export interface ProjectHeaderProps {
  /** Upper-case project key from the route ("PAY"). */
  projectKey: string;
  /** Tab of the current page. */
  current: ProjectView;
  /** Text after "PAY · " under the title: "12 open · board", "4 open milestones". */
  subtitle?: ReactNode;
  /** Right side of the 64px header: a SearchField, the primary Button. */
  actions?: ReactNode;
  /** Content of the 36px filter bar under the tabs (Selects with variant="filter"). No bar when omitted. */
  filters?: ReactNode;
  /** Right end of the filter bar (the List / Board switch). */
  filtersEnd?: ReactNode;
  className?: string;
}

/** The project as listed in the rail (name, flags, open count, current cycle), from the cached list. */
export function useProjectSummary(projectKey: string): ProjectWithCounts | undefined {
  return useQuery({
    ...projectsQuery(),
    select: (data) => data.items.find((item) => item.key === projectKey),
  }).data;
}

/** Milestones of the project that are not completed (the Milestones tab count). */
function useOpenMilestoneCount(projectKey: string, enabled: boolean): number | undefined {
  return useQuery({
    // Same retry policy as the planning screens, so a failing request shows their error banner quickly.
    ...orpc.milestones.list.queryOptions({ input: { project: projectKey }, retry: retryOnce }),
    enabled,
    select: (data) => data.items.filter((milestone) => milestone.status !== 'completed').length,
  }).data;
}

export function ProjectHeader({
  projectKey,
  current,
  subtitle,
  actions,
  filters,
  filtersEnd,
  className,
}: ProjectHeaderProps) {
  const project = useProjectSummary(projectKey);
  const milestoneCount = useOpenMilestoneCount(projectKey, project?.usesMilestones ?? false);
  const tabs = project ? projectTabs(project, milestoneCount) : [];

  return (
    <div className={className}>
      <PageHeader
        title={project?.name ?? projectKey}
        subtitle={
          <>
            <span className="font-mono">{projectKey}</span>
            {subtitle != null ? <> · {subtitle}</> : null}
          </>
        }
        actions={actions}
      />
      {tabs.length ? (
        <ViewTabs items={tabs} currentId={current} aria-label={`${project?.name ?? projectKey} views`} />
      ) : null}
      {filters ? (
        <FilterBar end={filtersEnd} className="min-w-0 overflow-x-auto overflow-y-hidden">
          {filters}
        </FilterBar>
      ) : null}
    </div>
  );
}
