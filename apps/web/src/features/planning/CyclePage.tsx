import type { CycleDetail, CycleRollover, CycleSelector, TaskListItem } from '@pm/contracts';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { useProjectSummary, ViewSwitch } from '~/features/project-header';
import { useNow } from '~/features/tasks/clock';
import { atTime, formatAge } from '~/features/tasks/format';
import { taskListQuery } from '~/features/tasks/queries';
import {
  Button,
  CycleGlyph,
  DaysLeftPill,
  EmptyState,
  FilterBar,
  MemberLabel,
  type PickerItem,
  PickerPopover,
  PriorityGlyph,
  Skeleton,
  STATUS_LABELS,
  StatStrip,
  StatTile,
  StatusSquare,
  Tag,
  useCopy,
  useHotkeys,
} from '~/ui';
import { EditCycleDialog, nextCycleNumber } from './CycleDialogHost';
import { CycleBars, cycleHref, elapsedDays, splitCycles } from './CyclesScreen';
import { describeStart, formatRange, lengthInDays } from './dates';
import { EndCycleDialog } from './EndCycleDialog';
import { filterUnassigned, PlanningFilters, taskFilters } from './PlanningFilters';
import { compareTasks, PlanningTaskTable } from './PlanningTaskTable';
import {
  CrumbHeader,
  GroupBand,
  ListCell,
  ListHead,
  ListRow,
  ListTable,
  LoadError,
  RowLink,
  useServerToday,
} from './parts';
import { cycleQuery, cyclesQuery, useAddToCycle, useEndCycle } from './queries';
import type { PlanningTasksSearch } from './search';

// /p/PAY/cycles/12 (frames 24 to 27). A current or upcoming cycle shows its bars and tasks grouped by
// status, with "+ Oct 17" on tasks added after the start; End cycle opens the end dialog. A completed
// cycle shows the summary written when it ended and the record of what rolled over.

const OPEN_STATUSES = ['backlog', 'todo', 'in_progress', 'in_review'] as const;

/** Route param to a cycle selector: 12, current or next. */
export function parseCycleParam(value: string): CycleSelector | null {
  if (value === 'current' || value === 'next') return value;
  return /^[1-9][0-9]{0,8}$/.test(value) ? Number(value) : null;
}

export interface CyclePageProps {
  projectKey: string;
  selector: CycleSelector;
  search: PlanningTasksSearch;
}

export function CyclePage({ projectKey, selector, search }: CyclePageProps) {
  const navigate = useNavigate();
  const project = useProjectSummary(projectKey);
  const cycle = useQuery(cycleQuery(projectKey, selector));
  const data = cycle.data;
  const projectName = project?.name ?? projectKey;
  const crumbs = [
    { label: projectName, href: `/p/${projectKey}` },
    { label: 'Cycles', href: `/p/${projectKey}/cycles` },
    { label: data ? `Cycle ${data.number}` : typeof selector === 'number' ? `Cycle ${selector}` : '…' },
  ];

  if (cycle.isError && !data) {
    const missing = (cycle.error as { code?: string }).code === 'NOT_FOUND';
    return (
      <section aria-label="Cycle" className="flex h-dvh min-h-0 min-w-0 flex-1 flex-col bg-bg text-fg">
        <CrumbHeader crumbs={crumbs} />
        {missing ? (
          <div className="flex px-6 py-12">
            <EmptyState
              title={
                selector === 'current'
                  ? 'No cycle is running'
                  : selector === 'next'
                    ? 'No upcoming cycle'
                    : 'This cycle does not exist'
              }
              text="Cycles of this project are listed on the Cycles page."
              action={
                <Button
                  variant="secondary"
                  onPress={() => void navigate({ href: `/p/${projectKey}/cycles` })}
                >
                  All cycles
                </Button>
              }
            />
          </div>
        ) : (
          <LoadError
            what="this cycle"
            error={cycle.error}
            onRetry={() => void cycle.refetch()}
            isRetrying={cycle.isFetching}
          />
        )}
      </section>
    );
  }

  if (!data) {
    return (
      <section aria-label="Cycle" className="flex h-dvh min-h-0 min-w-0 flex-1 flex-col bg-bg text-fg">
        <CrumbHeader crumbs={crumbs} />
        <div aria-busy="true" className="flex flex-col gap-3.5 border-b border-line px-6 py-[18px]">
          <Skeleton width={240} height={20} />
          <Skeleton width={420} height={6} />
          <Skeleton width={420} height={6} />
        </div>
      </section>
    );
  }

  return data.state === 'completed' ? (
    <CompletedCycle projectKey={projectKey} cycle={data} crumbs={crumbs} />
  ) : (
    <ActiveCycle projectKey={projectKey} cycle={data} crumbs={crumbs} search={search} selector={selector} />
  );
}

type Crumbs = { label: string; href?: string }[];

// ---------------------------------------------------------------------------
// Current and upcoming
// ---------------------------------------------------------------------------

interface ActiveCycleProps {
  projectKey: string;
  cycle: CycleDetail;
  crumbs: Crumbs;
  search: PlanningTasksSearch;
  selector: CycleSelector;
}

function ActiveCycle({ projectKey, cycle, crumbs, search, selector }: ActiveCycleProps) {
  const navigate = useNavigate();
  const project = useProjectSummary(projectKey);
  const now = useNow();
  const today = useServerToday(projectKey);
  const isCurrent = cycle.state === 'current';
  const number = cycle.number;
  const tasks = useQuery(
    taskListQuery({ project: projectKey, cycle: String(number), ...taskFilters(search) }),
  );
  // Unfiltered, for the end dialog's list.
  const allTasks = useQuery(taskListQuery({ project: projectKey, cycle: String(number) }));
  const cycles = useQuery(cyclesQuery(projectKey));
  const [ending, setEnding] = useState(false);
  const [editing, setEditing] = useState(false);
  const end = useEndCycle();

  const visibleTasks = useMemo(() => filterUnassigned(tasks.data?.items ?? [], search), [tasks.data, search]);
  const unfinished = useMemo(
    () => (allTasks.data?.items ?? []).filter((task) => task.status !== 'done' && task.status !== 'canceled'),
    [allTasks.data],
  );
  const split = cycles.data ? splitCycles(cycles.data.items) : undefined;
  const next = split?.upcoming.find((item) => item.number !== number);

  const openTask = (key: string) =>
    void navigate({ to: '/p/$projectKey/$taskKey', params: { projectKey, taskKey: key } });
  const toBoard = () => void navigate({ href: `/p/${projectKey}?view=board&cycle=${number}` });
  const writeSearch = (nextSearch: PlanningTasksSearch) =>
    void navigate({
      to: '/p/$projectKey/cycles/$cycleNumber',
      params: { projectKey, cycleNumber: String(selector) },
      search: nextSearch as never,
      replace: true,
    });

  useHotkeys({ v: toBoard });

  const onEnd = async (moveTo: number | 'none' | undefined) => {
    try {
      await end.mutateAsync({ project: projectKey, number, ...(moveTo !== undefined ? { moveTo } : {}) });
    } catch (error) {
      return (error as Error).message || "Couldn't end the cycle. Try again.";
    }
    setEnding(false);
    // A "current" link would now show the next cycle: stay on this one.
    if (selector !== number) {
      void navigate({
        to: '/p/$projectKey/cycles/$cycleNumber',
        params: { projectKey, cycleNumber: String(number) },
      });
    }
    return null;
  };

  const length = lengthInDays(cycle.startsOn, cycle.endsOn);
  const added = cycle.counts.addedAfterStart;
  const filtered = Object.keys(search).length > 0;

  return (
    <section
      aria-label={`Cycle ${number}`}
      className="flex h-dvh min-h-0 min-w-0 flex-1 flex-col bg-bg text-fg"
    >
      <CrumbHeader
        crumbs={crumbs}
        actions={
          <>
            {isCurrent ? (
              <Button variant="secondary" isDisabled={!allTasks.data} onPress={() => setEnding(true)}>
                End cycle
              </Button>
            ) : (
              <Button variant="secondary" isDisabled={!today} onPress={() => setEditing(true)}>
                Edit
              </Button>
            )}
            <AddTasks projectKey={projectKey} number={number} />
          </>
        }
      />
      <div className="flex shrink-0 flex-col gap-3.5 border-b border-line px-6 py-[18px]">
        <div className="flex min-w-0 items-center gap-3">
          <CycleGlyph
            state={isCurrent ? 'progress' : 'empty'}
            progress={length ? elapsedDays(cycle) / length : 0}
            size={14}
            className={isCurrent ? 'text-accent' : undefined}
          />
          <h1 className="m-0 shrink-0 text-[24px] leading-tight font-semibold tracking-[-0.015em]">
            Cycle {number}
          </h1>
          {cycle.name ? <span className="truncate text-[16px] text-muted">{cycle.name}</span> : null}
          <Tag tone={isCurrent ? 'accent' : 'default'}>{isCurrent ? 'Current' : 'Upcoming'}</Tag>
          <span className="flex-1" />
          <span className="shrink-0 text-muted">{formatRange(cycle.startsOn, cycle.endsOn)}</span>
          {isCurrent && cycle.daysLeft != null ? (
            <DaysLeftPill daysLeft={cycle.daysLeft} />
          ) : today ? (
            <span className="shrink-0 text-[11.5px] text-muted">{describeStart(cycle.startsOn, today)}</span>
          ) : null}
        </div>
        {isCurrent ? (
          <CycleBars
            cycle={cycle}
            barWidth={420}
            note={
              added
                ? `${added} ${added === 1 ? 'task' : 'tasks'} added after the start ${added === 1 ? 'is' : 'are'} marked +`
                : undefined
            }
          />
        ) : (
          <p className="m-0 text-[11.5px] text-muted">
            {cycle.counts.total} {cycle.counts.total === 1 ? 'task' : 'tasks'} planned. Tasks added once it
            starts are marked +.
          </p>
        )}
      </div>
      <FilterBar end={<ViewSwitch view="list" onChange={(view) => view === 'board' && toBoard()} />}>
        <PlanningFilters
          projectKey={projectKey}
          search={search}
          onChange={writeSearch}
          third={project?.usesMilestones === false ? undefined : 'milestone'}
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
            aria-label={`Tasks in Cycle ${number}`}
            tasks={visibleTasks}
            extra={isCurrent ? 'added' : undefined}
            cycleStartsOn={cycle.startsOn}
            statuses={search.status}
            isLoading={tasks.isPending}
            now={now}
            onOpen={openTask}
            renderEmptyState={() => (
              <div className="flex flex-col items-start gap-2 px-6 py-8 text-muted">
                <span>
                  {filtered
                    ? 'No tasks in this cycle match these filters.'
                    : 'No tasks in this cycle yet. Add the ones you mean to finish in it.'}
                </span>
                {filtered ? (
                  <Button variant="secondary" size="sm" onPress={() => writeSearch({})}>
                    Clear filters
                  </Button>
                ) : null}
              </div>
            )}
          />
        )}
      </div>
      {isCurrent ? (
        <EndCycleDialog
          isOpen={ending}
          onClose={() => setEnding(false)}
          cycle={cycle}
          next={next}
          newNumber={cycles.data ? nextCycleNumber(cycles.data.items) : number + 1}
          unfinished={unfinished}
          onSubmit={onEnd}
        />
      ) : today ? (
        <EditCycleDialog
          projectKey={projectKey}
          cycle={cycle}
          isOpen={editing}
          onClose={() => setEditing(false)}
          today={today}
        />
      ) : null}
    </section>
  );
}

/** "Add tasks": a searchable list of the project's open tasks outside this cycle; picking one moves it in. */
function AddTasks({ projectKey, number }: { projectKey: string; number: number }) {
  const [open, setOpen] = useState(false);
  const candidates = useQuery({
    ...taskListQuery({ project: projectKey, status: [...OPEN_STATUSES] }),
    enabled: open,
  });
  const add = useAddToCycle();
  const items = useMemo<PickerItem[]>(
    () =>
      (candidates.data?.items ?? [])
        .filter((task) => task.cycle?.number !== number)
        .map((task) => ({
          id: task.key,
          label: task.title,
          lead: <StatusSquare status={task.status} />,
          meta: task.cycle ? `${task.key} · C${task.cycle.number}` : task.key,
          textValue: `${task.key} ${task.title}`,
        })),
    [candidates.data, number],
  );
  return (
    <PickerPopover
      aria-label={`Add tasks to Cycle ${number}`}
      items={items}
      value={null}
      isOpen={open}
      onOpenChange={setOpen}
      onChange={(key) => {
        if (key) add.mutate({ key, cycle: number });
      }}
      searchPlaceholder="Add a task to the cycle…"
      emptyText={candidates.isPending ? 'Loading tasks…' : 'No open tasks outside this cycle'}
      footer={
        add.isError
          ? "Couldn't add the task. Try again."
          : 'Open tasks of the project. Picking one moves it here.'
      }
      placement="bottom end"
      width={420}
    >
      <Button isPending={add.isPending}>Add tasks</Button>
    </PickerPopover>
  );
}

// ---------------------------------------------------------------------------
// Completed
// ---------------------------------------------------------------------------

const ROLL_TEMPLATE = '72px minmax(0,1fr) 200px 120px';

/** Text copied by "Copy summary". */
export function cycleSummaryText(cycle: CycleDetail, canceled: readonly TaskListItem[]): string {
  const summary = cycle.summary;
  const title = cycle.name ? `Cycle ${cycle.number} · ${cycle.name}` : `Cycle ${cycle.number}`;
  const lines = [`${title} (${formatRange(cycle.startsOn, cycle.endsOn)})`];
  if (summary) {
    const percent = summary.scope ? Math.round((summary.completed / summary.scope) * 100) : 0;
    lines.push(
      `Scope ${summary.scope} · Completed ${summary.completed} (${percent}%) · Rolled over ${summary.rolledOver} · Canceled ${summary.canceled}`,
    );
  }
  if (cycle.rollovers.length) {
    lines.push('', 'Rolled over:');
    for (const roll of cycle.rollovers) {
      const to = roll.movedTo ? `Cycle ${roll.movedTo.number}` : 'no cycle';
      lines.push(`- ${roll.task.key} ${roll.task.title} (${STATUS_LABELS[roll.statusAtEnd]}, to ${to})`);
    }
  }
  if (canceled.length) {
    lines.push('', 'Canceled:');
    for (const task of canceled) lines.push(`- ${task.key} ${task.title}`);
  }
  return lines.join('\n');
}

/** "to Cycle 12", "to no cycle", "to Cycle 12 and no cycle". */
export function rolledOverTo(rollovers: readonly CycleRollover[]): string {
  if (!rollovers.length) return 'nothing moved';
  const targets = [
    ...new Set(rollovers.map((roll) => (roll.movedTo ? `Cycle ${roll.movedTo.number}` : 'no cycle'))),
  ];
  return `to ${targets.join(' and ')}`;
}

function CompletedCycle({
  projectKey,
  cycle,
  crumbs,
}: {
  projectKey: string;
  cycle: CycleDetail;
  crumbs: Crumbs;
}) {
  const now = useNow();
  const tasks = useQuery(taskListQuery({ project: projectKey, cycle: String(cycle.number) }));
  const { copied, copy } = useCopy();
  const summary = cycle.summary;
  const done = useMemo(
    () => (tasks.data?.items ?? []).filter((task) => task.status === 'done'),
    [tasks.data],
  );
  const canceled = useMemo(
    () => (tasks.data?.items ?? []).filter((task) => task.status === 'canceled'),
    [tasks.data],
  );
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const toggle = (status: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  const scope = summary?.scope ?? cycle.counts.total;
  const completed = summary?.completed ?? cycle.counts.done;
  const percent = scope ? Math.round((completed / scope) * 100) : 0;
  const canceledKeys = canceled.map((task) => task.key);

  return (
    <section
      aria-label={`Cycle ${cycle.number}`}
      className="flex h-dvh min-h-0 min-w-0 flex-1 flex-col bg-bg text-fg"
    >
      <CrumbHeader
        crumbs={crumbs}
        actions={
          <Button variant="secondary" onPress={() => void copy(cycleSummaryText(cycle, canceled))}>
            {copied ? 'Copied' : 'Copy summary'}
          </Button>
        }
      />
      <div className="flex shrink-0 flex-col gap-3.5 border-b border-line px-6 py-[18px]">
        <div className="flex min-w-0 items-center gap-3">
          <CycleGlyph state="done" size={14} />
          <h1 className="m-0 shrink-0 text-[24px] leading-tight font-semibold tracking-[-0.015em]">
            Cycle {cycle.number}
          </h1>
          {cycle.name ? <span className="truncate text-[16px] text-muted">{cycle.name}</span> : null}
          <Tag>Completed</Tag>
          <span className="flex-1" />
          <span className="shrink-0 text-muted">{formatRange(cycle.startsOn, cycle.endsOn)}</span>
        </div>
        <StatStrip aria-label={`Cycle ${cycle.number} summary`}>
          <StatTile label="Scope" value={scope} sub={`${summary?.addedAfterStart ?? 0} added after start`} />
          <StatTile label="Completed" value={completed} sub={`${percent}%`} tone="done" />
          <StatTile
            label="Rolled over"
            value={summary?.rolledOver ?? cycle.rollovers.length}
            sub={rolledOverTo(cycle.rollovers)}
            tone="warn"
          />
          <StatTile
            label="Canceled"
            value={summary?.canceled ?? canceled.length}
            sub={
              canceledKeys.length
                ? canceledKeys.slice(0, 4).join(', ') + (canceledKeys.length > 4 ? '…' : '')
                : 'none'
            }
            tone="muted"
          />
        </StatStrip>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <div>
          <GroupBand label="Rolled over" count={cycle.rollovers.length} />
          {cycle.rollovers.length ? (
            <>
              <ListHead
                template={ROLL_TEMPLATE}
                headers={['Key', 'Title', 'Status when it ended → now', 'Moved to']}
              />
              <ListTable label="Rolled over">
                {cycle.rollovers.map((roll) => (
                  <RolloverRow key={roll.task.id} projectKey={projectKey} roll={roll} />
                ))}
              </ListTable>
            </>
          ) : (
            <p className="m-0 border-b border-line-2 px-6 py-3 text-muted">
              Every task was finished or canceled.
            </p>
          )}
        </div>
        {/* Done and Canceled tasks still in the cycle, folded until opened. */}
        {(['done', 'canceled'] as const).map((status) => {
          const items = status === 'done' ? done : canceled;
          const count = (status === 'done' ? summary?.completed : summary?.canceled) ?? items.length;
          return (
            <div key={status}>
              <GroupBand
                label={status === 'done' ? 'Completed' : 'Canceled'}
                status={status}
                count={count}
                expanded={open.has(status)}
                onToggle={() => toggle(status)}
              />
              {open.has(status) ? (
                <FinishedRows
                  label={status === 'done' ? 'Completed tasks' : 'Canceled tasks'}
                  projectKey={projectKey}
                  tasks={items}
                  isLoading={tasks.isPending}
                  now={now}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function RolloverRow({ projectKey, roll }: { projectKey: string; roll: CycleRollover }) {
  const href = `/p/${projectKey}/${roll.task.key}`;
  return (
    <ListRow template={ROLL_TEMPLATE} href={href} minHeight={38}>
      <ListCell>
        <RowLink href={href} className="font-mono text-[10.5px] font-normal text-muted">
          {roll.task.key}
        </RowLink>
      </ListCell>
      <ListCell className="truncate">{roll.task.title}</ListCell>
      <ListCell className="flex items-center gap-1.5 text-[12px] whitespace-nowrap text-muted">
        <StatusSquare status={roll.statusAtEnd} withLabel />
        <span aria-hidden className="text-faint">
          →
        </span>
        <span className="sr-only">now</span>
        <StatusSquare status={roll.task.status} withLabel />
      </ListCell>
      <ListCell className="flex items-center gap-1.5 text-[12px] whitespace-nowrap text-muted">
        {roll.movedTo ? (
          <RowLink
            href={cycleHref(projectKey, roll.movedTo.number)}
            className="flex items-center gap-1.5 font-normal text-muted"
          >
            <CycleGlyph />
            Cycle {roll.movedTo.number}
          </RowLink>
        ) : (
          'No cycle'
        )}
      </ListCell>
    </ListRow>
  );
}

const FINISHED_TEMPLATE = '72px minmax(0,1fr) 34px 150px 34px';

/** Done or canceled tasks of a completed cycle, in the M1 row style without a header. */
function FinishedRows({
  label,
  projectKey,
  tasks,
  isLoading,
  now,
}: {
  label: string;
  projectKey: string;
  tasks: readonly TaskListItem[];
  isLoading: boolean;
  now: number | null;
}) {
  if (isLoading) {
    return (
      <div className="border-b border-line-2 px-6 py-3">
        <Skeleton width="40%" />
      </div>
    );
  }
  if (!tasks.length) {
    return <p className="m-0 border-b border-line-2 px-6 py-3 text-muted">None left in this cycle.</p>;
  }
  const age = atTime(formatAge, now);
  return (
    <ListTable label={label}>
      {[...tasks].sort(compareTasks).map((task) => {
        const href = `/p/${projectKey}/${task.key}`;
        return (
          <ListRow key={task.key} template={FINISHED_TEMPLATE} href={href} minHeight={34}>
            <ListCell>
              <RowLink href={href} className="font-mono text-[10.5px] font-normal text-muted">
                {task.key}
              </RowLink>
            </ListCell>
            <ListCell className="truncate">{task.title}</ListCell>
            <ListCell>
              <PriorityGlyph priority={task.priority} />
            </ListCell>
            <ListCell>
              {task.assignee ? (
                <MemberLabel
                  name={task.assignee.name}
                  kind={task.assignee.kind}
                  className="text-[12px] text-muted"
                />
              ) : null}
            </ListCell>
            <ListCell className="text-right">
              <time dateTime={task.updatedAt} className="font-mono text-[10px] whitespace-nowrap text-faint">
                {age(task.updatedAt)}
              </time>
            </ListCell>
          </ListRow>
        );
      })}
    </ListTable>
  );
}
