import {
  MILESTONE_STATUS_LABELS,
  MILESTONE_STATUSES,
  type MilestoneOwnedField,
  type MilestoneStatus,
  type MilestoneWithProgress,
  milestoneProgressRatio,
} from '@pm/contracts';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useDeferredValue, useMemo, useState } from 'react';
import {
  isMirrored,
  MilestoneRefusal,
  MirrorCreateButton,
  ProjectHeader,
  useProjectSummary,
} from '~/features/project-header';
import { usePageSearchRef } from '~/features/shell/page-search';
import {
  Button,
  cn,
  EmptyState,
  isMilestoneFilled,
  lockedHatch,
  MilestoneGlyph,
  NoticeStrip,
  type OptionItem,
  ProgressBar,
  SearchField,
  Select,
  SystemActorAvatar,
  Tag,
} from '~/ui';
import { describeTarget, formatDay } from './dates';
import { FeatureOff } from './FeatureOff';
import { NewMilestoneDialog } from './MilestoneDialogHost';
import {
  GroupBand,
  ListCell,
  ListHead,
  ListRow,
  ListSkeleton,
  ListTable,
  LoadError,
  RowChevron,
  RowLink,
  useServerToday,
} from './parts';
import { milestonesQuery } from './queries';
import { DEFAULT_MILESTONE_STATUSES, type MilestoneSort, type MilestonesSearch } from './search';

// /p/PAY/milestones (frames 14 to 21): open milestones with status, target and progress, the completed
// ones folded at the bottom; New milestone dialog; empty, loading and error states.
// Mirrored projects (M3): milestones come from Backlog.md files, so New milestone explains instead of
// creating, a strip says where they come from, and name, status and target carry the hatch.

const TEMPLATE = 'minmax(0,1fr) 96px 132px 240px 24px';
const HEADERS = ['Milestone', 'Status', 'Target', 'Progress', ''];

const STATUS_ITEMS: OptionItem[] = MILESTONE_STATUSES.map((status) => ({
  id: status,
  label: MILESTONE_STATUS_LABELS[status],
  prefix: <MilestoneGlyph filled={isMilestoneFilled(status)} />,
}));

const SORT_ITEMS: OptionItem[] = [
  { id: 'target', label: 'Target date' },
  { id: 'name', label: 'Name' },
  { id: 'progress', label: 'Progress' },
];

export function milestoneHref(projectKey: string, id: string): string {
  return `/p/${encodeURIComponent(projectKey)}/milestones/${encodeURIComponent(id)}`;
}

/** Target date first (none last), then name; or by name; or most done first. */
export function sortMilestones(
  items: readonly MilestoneWithProgress[],
  sort: MilestoneSort,
): MilestoneWithProgress[] {
  const byName = (a: MilestoneWithProgress, b: MilestoneWithProgress) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  const sorted = [...items];
  if (sort === 'name') return sorted.sort(byName);
  if (sort === 'progress') {
    return sorted.sort(
      (a, b) => milestoneProgressRatio(b.progress) - milestoneProgressRatio(a.progress) || byName(a, b),
    );
  }
  return sorted.sort((a, b) => {
    if (a.targetDate !== b.targetDate) {
      if (!a.targetDate) return 1;
      if (!b.targetDate) return -1;
      return a.targetDate.localeCompare(b.targetDate);
    }
    return byName(a, b);
  });
}

/** "4 open milestones", "1 open milestone", "no milestones yet". */
export function milestonesSubtitle(items: readonly MilestoneWithProgress[] | undefined): string | undefined {
  if (!items) return undefined;
  if (!items.length) return 'no milestones yet';
  const open = items.filter((item) => item.status !== 'completed').length;
  return `${open} open ${open === 1 ? 'milestone' : 'milestones'}`;
}

export interface MilestonesScreenProps {
  projectKey: string;
  search: MilestonesSearch;
}

export function MilestonesScreen({ projectKey, search }: MilestonesScreenProps) {
  const navigate = useNavigate();
  const project = useProjectSummary(projectKey);
  const milestones = useQuery(milestonesQuery(projectKey));
  const today = useServerToday(projectKey);
  const searchRef = usePageSearchRef();
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [creating, setCreating] = useState(false);
  const [completedOpen, setCompletedOpen] = useState<boolean | null>(null);

  const isOff = project != null && !project.usesMilestones;
  const mirrored = isMirrored(project);
  const projectName = project?.name ?? projectKey;
  const sort = search.sort ?? 'target';
  const statuses = search.status ?? DEFAULT_MILESTONE_STATUSES;
  const items = milestones.data?.items;

  const { open, completed } = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase();
    const matching = (items ?? []).filter((item) => !needle || item.name.toLowerCase().includes(needle));
    const sorted = sortMilestones(matching, sort);
    return {
      open: sorted.filter((item) => item.status !== 'completed' && statuses.includes(item.status)),
      completed: sorted.filter((item) => item.status === 'completed'),
    };
  }, [items, deferredQuery, sort, statuses]);

  const writeSearch = (next: MilestonesSearch) =>
    navigate({
      to: '/p/$projectKey/milestones',
      params: { projectKey },
      search: next as never,
      replace: true,
    });

  const showCompleted = completedOpen ?? statuses.includes('completed');
  const isEmpty = items?.length === 0;
  const newButton = mirrored ? (
    <MirrorCreateButton projectName={projectName} kind="milestone" kbd="">
      New milestone
    </MirrorCreateButton>
  ) : (
    <Button onPress={() => setCreating(true)}>New milestone</Button>
  );

  const body = () => {
    if (isOff) return <FeatureOff projectKey={projectKey} feature="milestones" />;
    if (milestones.isError && !milestones.data) {
      return (
        <LoadError
          what="milestones"
          error={milestones.error}
          onRetry={() => void milestones.refetch()}
          isRetrying={milestones.isFetching}
        />
      );
    }
    if (milestones.isPending) {
      return (
        <ListSkeleton
          template={TEMPLATE}
          widths={[42, 30, 55, 38].map((width) => [`${width}%`, 52, 70, 200, 0])}
        />
      );
    }
    if (isEmpty && mirrored) {
      return (
        <div className="flex px-6 py-12">
          <EmptyState
            className="max-w-[640px]"
            title="No milestones in Backlog.md yet"
            text={<MilestoneRefusal projectName={projectName} />}
          />
        </div>
      );
    }
    if (isEmpty) {
      return (
        <div className="flex px-6 py-12">
          <EmptyState
            className="max-w-[640px]"
            title="Group work toward a goal"
            text="A milestone collects the tasks behind one outcome, like a release or an audit, and tracks how many are done. Give it a target date if there is one. Each task belongs to at most one milestone."
            action={newButton}
            cli={{
              command: `pm milestones create --project ${projectKey} "Webhooks v2" --target 2026-11-14`,
            }}
          />
        </div>
      );
    }
    const noMatch = !open.length && !completed.length;
    return (
      <div className="min-h-0 flex-1 overflow-auto">
        {mirrored ? (
          <div className="border-b border-line px-6 py-2.5">
            <NoticeStrip marker={<SystemActorAvatar decorative />}>
              <span className="leading-normal">
                <MilestoneRefusal projectName={projectName} /> Hatched fields change in those files; progress
                counts the tasks here.
              </span>
            </NoticeStrip>
          </div>
        ) : null}
        <ListHead template={TEMPLATE} headers={HEADERS} />
        <ListTable label={`Milestones of ${project?.name ?? projectKey}`}>
          {open.map((milestone) => (
            <MilestoneRow key={milestone.id} projectKey={projectKey} milestone={milestone} today={today} />
          ))}
        </ListTable>
        {noMatch ? (
          <p className="m-0 px-6 py-4 text-muted">
            {query.trim() ? `No milestones match “${query.trim()}”.` : 'No milestones with these statuses.'}
          </p>
        ) : null}
        {completed.length ? (
          <>
            <GroupBand
              label="Completed"
              count={completed.length}
              expanded={showCompleted}
              onToggle={() => setCompletedOpen(!showCompleted)}
            />
            {showCompleted ? (
              <ListTable label="Completed milestones">
                {completed.map((milestone) => (
                  <MilestoneRow
                    key={milestone.id}
                    projectKey={projectKey}
                    milestone={milestone}
                    today={today}
                  />
                ))}
              </ListTable>
            ) : null}
          </>
        ) : null}
      </div>
    );
  };

  return (
    <section aria-label="Milestones" className="flex h-dvh min-h-0 min-w-0 flex-1 flex-col bg-bg text-fg">
      <ProjectHeader
        projectKey={projectKey}
        current="milestones"
        subtitle={isOff ? 'milestones are off' : milestonesSubtitle(items)}
        actions={
          isOff ? undefined : (
            <>
              <SearchField
                width={150}
                value={query}
                onChange={setQuery}
                inputRef={searchRef}
                aria-label="Search milestones"
              />
              {newButton}
            </>
          )
        }
        filters={
          !isOff && items?.length ? (
            <>
              <Select
                label="Status"
                variant="filter"
                selectionMode="multiple"
                items={STATUS_ITEMS}
                value={[...statuses]}
                onChange={(keys) => {
                  const picked = keys.map(String) as MilestoneStatus[];
                  const isDefault =
                    !picked.length ||
                    (picked.length === 2 &&
                      DEFAULT_MILESTONE_STATUSES.every((item) => picked.includes(item)));
                  setCompletedOpen(null);
                  void writeSearch({ ...search, status: isDefault ? undefined : picked });
                }}
              />
              <Select
                label="Sort"
                variant="filter"
                items={SORT_ITEMS}
                value={sort}
                onChange={(key) =>
                  void writeSearch({
                    ...search,
                    sort: key === 'target' || key == null ? undefined : (key as MilestoneSort),
                  })
                }
              />
            </>
          ) : undefined
        }
      />
      {body()}
      {today ? (
        <NewMilestoneDialog
          projectKey={projectKey}
          isOpen={creating}
          onClose={() => setCreating(false)}
          today={today}
        />
      ) : null}
    </section>
  );
}

interface MilestoneRowProps {
  projectKey: string;
  milestone: MilestoneWithProgress;
  today: string | null;
}

function MilestoneRow({ projectKey, milestone, today }: MilestoneRowProps) {
  const href = milestoneHref(projectKey, milestone.id);
  const { progress } = milestone;
  const target = targetText(milestone, today);
  const locked = new Set<MilestoneOwnedField>(milestone.locked ?? []);
  const hatch = (field: MilestoneOwnedField) =>
    locked.has(field) ? cn(lockedHatch, '-my-1 py-1') : undefined;
  return (
    <ListRow template={TEMPLATE} href={href}>
      <ListCell className={cn('flex flex-col gap-0.5', hatch('name'))}>
        <span className="flex min-w-0 items-center gap-2">
          <MilestoneGlyph filled={isMilestoneFilled(milestone.status)} />
          <RowLink href={href} className="text-[13.5px]">
            {milestone.name}
          </RowLink>
        </span>
        <span className="truncate pl-[15px] text-[11.5px] text-muted">
          {firstLine(milestone.description) || 'No description'}
        </span>
      </ListCell>
      <ListCell className={hatch('status')}>
        <Tag tone={milestone.status === 'active' ? 'accent' : 'default'}>
          {MILESTONE_STATUS_LABELS[milestone.status]}
        </Tag>
      </ListCell>
      <ListCell className={cn('flex flex-col gap-0.5', hatch('targetDate'))}>
        <span
          className={cn(
            target.tone === 'warn' ? 'text-warn' : target.tone === 'faint' ? 'text-faint' : 'text-fg',
          )}
        >
          {target.date}
        </span>
        {target.sub ? <span className="truncate text-[11.5px] text-muted">{target.sub}</span> : null}
      </ListCell>
      <ListCell>
        <ProgressBar
          done={progress.done}
          inProgress={progress.inProgress}
          total={progress.total - progress.canceled}
          showCount
          className="max-w-[240px]"
          label={`${milestone.name} progress`}
        />
      </ListCell>
      <RowChevron />
    </ListRow>
  );
}

/** The Target cell: date (warn when overdue) and "22 days left" / "3 days overdue" / "Completed Oct 3". */
export function targetText(
  milestone: Pick<MilestoneWithProgress, 'targetDate' | 'daysLeft' | 'overdue' | 'status' | 'completedAt'>,
  today: string | null,
): { date: string; sub: string; tone: 'default' | 'warn' | 'faint' } {
  if (!milestone.targetDate) {
    return { date: 'No date', sub: completedSub(milestone), tone: 'faint' };
  }
  const date = formatDay(milestone.targetDate, today ?? milestone.targetDate);
  if (milestone.status === 'completed') return { date, sub: completedSub(milestone), tone: 'default' };
  const sub = milestone.daysLeft == null ? '' : describeTarget(milestone.daysLeft).text;
  return { date, sub, tone: milestone.overdue ? 'warn' : 'default' };
}

function completedSub(milestone: Pick<MilestoneWithProgress, 'status' | 'completedAt'>): string {
  if (milestone.status !== 'completed') return '';
  return 'Completed';
}

function firstLine(markdown: string | null): string {
  if (!markdown) return '';
  return (
    markdown
      .split('\n')
      .map((line) => line.replace(/^[#>*\-+\s]+/, '').trim())
      .find(Boolean) ?? ''
  );
}
