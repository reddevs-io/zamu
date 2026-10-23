import { MILESTONE_STATUS_LABELS, milestoneProgressRatio } from '@pm/contracts';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { useProjectSummary, ViewSwitch } from '~/features/project-header';
import { useOptionalQuickCreate } from '~/features/shell/quick-create';
import { useNow } from '~/features/tasks/clock';
import { Markdown } from '~/features/tasks/Markdown';
import { taskListQuery } from '~/features/tasks/queries';
import {
  Button,
  EmptyState,
  FilterBar,
  isMilestoneFilled,
  MilestoneGlyph,
  ProgressBar,
  Skeleton,
  Tag,
  useHotkeys,
} from '~/ui';
import { describeTarget, formatDay } from './dates';
import { EditMilestoneDialog } from './MilestoneDialogHost';
import { filterUnassigned, PlanningFilters, taskFilters } from './PlanningFilters';
import { PlanningTaskTable } from './PlanningTaskTable';
import { CrumbHeader, LoadError, useServerToday } from './parts';
import { milestoneQuery } from './queries';
import type { PlanningTasksSearch } from './search';

// /p/PAY/milestones/<id> (frames 17 and 18): the milestone with its progress and target, then its tasks
// grouped by status. Edit opens the milestone dialog; New task opens quick create; Board shows the
// project board filtered to this milestone.

export interface MilestonePageProps {
  projectKey: string;
  milestoneId: string;
  search: PlanningTasksSearch;
}

export function MilestonePage({ projectKey, milestoneId, search }: MilestonePageProps) {
  const navigate = useNavigate();
  const quickCreate = useOptionalQuickCreate();
  const project = useProjectSummary(projectKey);
  const milestone = useQuery(milestoneQuery(milestoneId));
  const tasks = useQuery(
    taskListQuery({ project: projectKey, milestone: milestoneId, ...taskFilters(search) }),
  );
  const now = useNow();
  const today = useServerToday(projectKey);
  const [editing, setEditing] = useState(false);

  const projectName = project?.name ?? projectKey;
  const data = milestone.data;
  const visibleTasks = useMemo(() => filterUnassigned(tasks.data?.items ?? [], search), [tasks.data, search]);

  const openTask = (key: string) =>
    void navigate({ to: '/p/$projectKey/$taskKey', params: { projectKey, taskKey: key } });
  const toBoard = () => void navigate({ href: `/p/${projectKey}?view=board&milestone=${milestoneId}` });
  const newTask = () => quickCreate?.open(projectKey);
  const writeSearch = (next: PlanningTasksSearch) =>
    void navigate({
      to: '/p/$projectKey/milestones/$milestoneId',
      params: { projectKey, milestoneId },
      search: next as never,
      replace: true,
    });

  useHotkeys({ v: toBoard });

  const crumbs = [
    { label: projectName, href: `/p/${projectKey}` },
    { label: 'Milestones', href: `/p/${projectKey}/milestones` },
    { label: data?.name ?? (milestone.isError ? 'Milestone' : '…') },
  ];

  if (milestone.isError && !data) {
    const missing = (milestone.error as { code?: string }).code === 'NOT_FOUND';
    return (
      <section aria-label="Milestone" className="flex h-dvh min-h-0 min-w-0 flex-1 flex-col bg-bg text-fg">
        <CrumbHeader crumbs={crumbs} />
        {missing ? (
          <div className="flex px-6 py-12">
            <EmptyState
              title="This milestone does not exist"
              text="It may have been deleted. Its tasks keep their other fields."
              action={
                <Button
                  variant="secondary"
                  onPress={() => void navigate({ href: `/p/${projectKey}/milestones` })}
                >
                  All milestones
                </Button>
              }
            />
          </div>
        ) : (
          <LoadError
            what="this milestone"
            error={milestone.error}
            onRetry={() => void milestone.refetch()}
            isRetrying={milestone.isFetching}
          />
        )}
      </section>
    );
  }

  const progress = data?.progress;
  const counted = progress ? progress.total - progress.canceled : 0;
  const percent = progress ? Math.round(milestoneProgressRatio(progress) * 100) : 0;
  const target = data?.targetDate ? formatDay(data.targetDate, today ?? data.targetDate) : null;
  const due =
    data && data.status !== 'completed' && data.daysLeft != null ? describeTarget(data.daysLeft) : null;

  return (
    <section aria-label="Milestone" className="flex h-dvh min-h-0 min-w-0 flex-1 flex-col bg-bg text-fg">
      <CrumbHeader
        crumbs={crumbs}
        actions={
          <>
            <Button variant="secondary" isDisabled={!data || !today} onPress={() => setEditing(true)}>
              Edit
            </Button>
            <Button kbd="C" aria-keyshortcuts="c" onPress={newTask}>
              New task
            </Button>
          </>
        }
      />
      <div className="flex shrink-0 flex-col gap-3.5 border-b border-line px-6 pt-5 pb-[18px]">
        {data ? (
          <>
            <div className="flex min-w-0 items-center gap-3">
              <MilestoneGlyph filled={isMilestoneFilled(data.status)} size={10} />
              <h1 className="m-0 truncate text-[24px] leading-tight font-semibold tracking-[-0.015em]">
                {data.name}
              </h1>
              <Tag tone={data.status === 'active' ? 'accent' : 'default'}>
                {MILESTONE_STATUS_LABELS[data.status]}
              </Tag>
            </div>
            {data.description ? (
              <div className="max-w-[760px] text-muted">
                <Markdown source={data.description} size="page" />
              </div>
            ) : null}
            <div className="flex min-w-0 items-center gap-3.5">
              <ProgressBar
                size="md"
                done={progress?.done ?? 0}
                inProgress={progress?.inProgress ?? 0}
                total={counted}
                label="Milestone progress"
                className="w-[360px] max-w-[360px] flex-none"
              />
              <span className="font-mono text-[12px] text-fg">{percent}%</span>
              <span className="font-mono text-[10.5px] text-muted">
                {progress?.done ?? 0} of {counted} done · {progress?.inProgress ?? 0} in progress
              </span>
              <span className="flex-1" />
              <span className="text-muted">
                {target ? (
                  <>
                    Target <b className="font-semibold text-fg">{target}</b>
                    {due ? (
                      <>
                        {' · '}
                        <span className={due.overdue ? 'text-warn' : undefined}>{due.text}</span>
                      </>
                    ) : null}
                  </>
                ) : (
                  'No target date'
                )}
              </span>
            </div>
          </>
        ) : (
          <div aria-busy="true" className="flex flex-col gap-3.5">
            <Skeleton width={260} height={20} />
            <Skeleton width="50%" />
            <Skeleton width={360} height={8} />
          </div>
        )}
      </div>
      <FilterBar end={<ViewSwitch view="list" onChange={(view) => view === 'board' && toBoard()} />}>
        <PlanningFilters
          projectKey={projectKey}
          search={search}
          onChange={writeSearch}
          third={project?.usesCycles === false ? undefined : 'cycle'}
          statusPlaceholder="Open"
        />
      </FilterBar>
      <div className="flex min-h-0 flex-1 flex-col">
        {tasks.isError && !tasks.data ? (
          <LoadError
            what="the tasks"
            error={tasks.error}
            onRetry={() => void tasks.refetch()}
            isRetrying={tasks.isFetching}
          />
        ) : (
          <PlanningTaskTable
            aria-label={`Tasks in ${data?.name ?? 'the milestone'}`}
            tasks={visibleTasks}
            extra={project?.usesCycles === false ? undefined : 'cycle'}
            statuses={search.status}
            isLoading={tasks.isPending}
            now={now}
            onOpen={openTask}
            renderEmptyState={() => (
              <div className="flex flex-col items-start gap-2 px-6 py-8 text-muted">
                <span>
                  {Object.keys(search).length
                    ? 'No tasks in this milestone match these filters.'
                    : 'No tasks in this milestone yet. Set the milestone from a task, or create one here.'}
                </span>
                {Object.keys(search).length ? (
                  <Button variant="secondary" size="sm" onPress={() => writeSearch({})}>
                    Clear filters
                  </Button>
                ) : (
                  <Button variant="secondary" size="sm" onPress={newTask}>
                    New task
                  </Button>
                )}
              </div>
            )}
          />
        )}
      </div>
      {data && today ? (
        <EditMilestoneDialog
          projectKey={projectKey}
          milestone={data}
          isOpen={editing}
          onClose={() => setEditing(false)}
          today={today}
        />
      ) : null}
    </section>
  );
}
