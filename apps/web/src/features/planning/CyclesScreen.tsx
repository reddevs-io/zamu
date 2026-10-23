import type { Cycle } from '@pm/contracts';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useDeferredValue, useMemo, useState } from 'react';
import { ProjectHeader, useProjectSummary } from '~/features/project-header';
import { usePageSearchRef } from '~/features/shell/page-search';
import {
  Button,
  CycleGlyph,
  DaysLeftPill,
  ProgressBar,
  SearchField,
  Skeleton,
  StatStrip,
  StatTile,
  StatusSquare,
  Tag,
  TimeBar,
} from '~/ui';
import { cycleDefaults } from './CycleDialog';
import { NewCycleDialog } from './CycleDialogHost';
import {
  describeEnd,
  describeStart,
  formatLengthSentence,
  formatLongWeekdayDay,
  formatRange,
  lengthInDays,
} from './dates';
import { FeatureOff } from './FeatureOff';
import {
  GroupBand,
  ListCell,
  ListHead,
  ListRow,
  ListTable,
  LoadError,
  RowChevron,
  RowLink,
  useServerToday,
} from './parts';
import { cyclesQuery } from './queries';

// /p/PAY/cycles (frames 22 to 31): the current cycle card with its numbers and bars, then the upcoming
// and completed cycles. New cycle dialog prefilled from the last cycle; empty, loading and error states.

const TEMPLATE = 'minmax(0,1fr) 190px 120px 220px 24px';
const HEADERS = ['Cycle', 'Dates', 'Tasks', 'Result', ''];

export function cycleHref(projectKey: string, number: number): string {
  return `/p/${encodeURIComponent(projectKey)}/cycles/${number}`;
}

export function cycleTitle(cycle: Pick<Cycle, 'number' | 'name'>): string {
  return cycle.name ? `Cycle ${cycle.number} · ${cycle.name}` : `Cycle ${cycle.number}`;
}

/** Days gone in a current cycle: 11 of 14 when 3 days are left. */
export function elapsedDays(cycle: Pick<Cycle, 'startsOn' | 'endsOn' | 'daysLeft'>): number {
  const length = lengthInDays(cycle.startsOn, cycle.endsOn);
  return cycle.daysLeft == null ? 0 : Math.max(0, length - cycle.daysLeft);
}

export interface SplitCycles {
  current: Cycle | undefined;
  upcoming: Cycle[];
  completed: Cycle[];
}

/** Current, upcoming (soonest first) and completed (latest first). */
export function splitCycles(cycles: readonly Cycle[]): SplitCycles {
  return {
    current: cycles.find((cycle) => cycle.state === 'current'),
    upcoming: cycles
      .filter((cycle) => cycle.state === 'upcoming')
      .sort((a, b) => a.startsOn.localeCompare(b.startsOn)),
    completed: cycles.filter((cycle) => cycle.state === 'completed').sort((a, b) => b.number - a.number),
  };
}

/** "Cycle 12 ends Sunday", "Cycle 13 starts Monday", "no cycles yet". */
export function cyclesSubtitle(
  split: SplitCycles | undefined,
  today: string | null,
  total: number | undefined,
) {
  if (!split || total === undefined) return undefined;
  if (total === 0) return 'no cycles yet';
  if (split.current) {
    return today
      ? `Cycle ${split.current.number} ${describeEnd(split.current.endsOn, today)}`
      : `Cycle ${split.current.number}`;
  }
  const next = split.upcoming[0];
  if (next) {
    return today
      ? `Cycle ${next.number} ${describeStart(next.startsOn, today).replace(/^Starts/, 'starts')}`
      : `Cycle ${next.number}`;
  }
  return 'no current cycle';
}

export function CyclesScreen({ projectKey }: { projectKey: string }) {
  const project = useProjectSummary(projectKey);
  const cycles = useQuery(cyclesQuery(projectKey));
  const today = useServerToday(projectKey);
  const searchRef = usePageSearchRef();
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [creating, setCreating] = useState(false);

  const isOff = project != null && !project.usesCycles;
  const items = cycles.data?.items;
  const split = useMemo(() => (items ? splitCycles(items) : undefined), [items]);
  const filtered = useMemo(() => {
    if (!split) return undefined;
    const needle = deferredQuery.trim().toLowerCase();
    if (!needle) return split;
    const match = (cycle: Cycle) => cycleTitle(cycle).toLowerCase().includes(needle);
    return {
      current: split.current && match(split.current) ? split.current : undefined,
      upcoming: split.upcoming.filter(match),
      completed: split.completed.filter(match),
    };
  }, [split, deferredQuery]);

  const isEmpty = items?.length === 0;

  const body = () => {
    if (isOff) return <FeatureOff projectKey={projectKey} feature="cycles" />;
    if (cycles.isError && !cycles.data) {
      return (
        <LoadError
          what="cycles"
          error={cycles.error}
          onRetry={() => void cycles.refetch()}
          isRetrying={cycles.isFetching}
        />
      );
    }
    if (cycles.isPending || !filtered) return <CurrentCardSkeleton />;
    if (isEmpty) {
      const first = today ? cycleDefaults([], today) : null;
      return (
        <div className="flex px-6 py-12">
          <div className="flex max-w-[500px] flex-col items-start gap-3">
            <h2 className="m-0 text-[22px] leading-tight font-semibold tracking-[-0.015em]">
              Work in fixed-length cycles
            </h2>
            <p className="m-0 leading-[1.55] text-muted">
              A cycle is a sprint with a start and an end date. Put the tasks you mean to finish in it. When
              it ends, anything unfinished moves to the next cycle and the finished cycle keeps a record of
              what moved.
            </p>
            <Button isDisabled={!today} onPress={() => setCreating(true)}>
              Start Cycle 1
            </Button>
            {first ? (
              <p className="m-0 text-[11.5px] text-muted">
                {formatLengthSentence(lengthInDays(first.startsOn, first.endsOn))} from{' '}
                {formatLongWeekdayDay(first.startsOn)}. You can change the length.
              </p>
            ) : null}
          </div>
        </div>
      );
    }
    const { current, upcoming, completed } = filtered;
    const nothing = !current && !upcoming.length && !completed.length;
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        {current ? <CurrentCycleCard projectKey={projectKey} cycle={current} /> : null}
        {nothing ? <p className="m-0 px-6 py-4 text-muted">No cycles match “{query.trim()}”.</p> : null}
        {upcoming.length ? (
          <>
            <GroupBand label="Upcoming" count={upcoming.length} className="mt-3 border-t" />
            <ListHead template={TEMPLATE} headers={HEADERS} />
            <ListTable label="Upcoming cycles">
              {upcoming.map((cycle) => (
                <CycleRow key={cycle.id} projectKey={projectKey} cycle={cycle} today={today} />
              ))}
            </ListTable>
          </>
        ) : null}
        {completed.length ? (
          <>
            <GroupBand
              label="Completed"
              count={completed.length}
              className={upcoming.length ? undefined : 'mt-3 border-t'}
            />
            {upcoming.length ? null : <ListHead template={TEMPLATE} headers={HEADERS} />}
            <ListTable label="Completed cycles">
              {completed.map((cycle) => (
                <CycleRow key={cycle.id} projectKey={projectKey} cycle={cycle} today={today} />
              ))}
            </ListTable>
          </>
        ) : null}
      </div>
    );
  };

  return (
    <section aria-label="Cycles" className="flex h-dvh min-h-0 min-w-0 flex-1 flex-col bg-bg text-fg">
      <ProjectHeader
        projectKey={projectKey}
        current="cycles"
        subtitle={isOff ? 'cycles are off' : cyclesSubtitle(split, today, items?.length)}
        actions={
          isOff ? undefined : (
            <>
              <SearchField
                width={150}
                value={query}
                onChange={setQuery}
                inputRef={searchRef}
                aria-label="Search cycles"
              />
              <Button isDisabled={!today || !items} onPress={() => setCreating(true)}>
                New cycle
              </Button>
            </>
          )
        }
      />
      {body()}
      {today && items ? (
        <NewCycleDialog
          projectKey={projectKey}
          cycles={items}
          isOpen={creating}
          onClose={() => setCreating(false)}
          today={today}
        />
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Current cycle card
// ---------------------------------------------------------------------------

export function CurrentCycleCard({ projectKey, cycle }: { projectKey: string; cycle: Cycle }) {
  const navigate = useNavigate();
  const { counts } = cycle;
  const length = lengthInDays(cycle.startsOn, cycle.endsOn);
  const elapsed = elapsedDays(cycle);
  const scope = counts.total;
  const inProgress = counts.in_progress + counts.in_review;
  const todo = counts.todo + counts.backlog;
  const percent = scope ? Math.round((counts.done / scope) * 100) : 0;
  return (
    <section
      aria-label={`Current cycle: Cycle ${cycle.number}`}
      className="mx-6 mt-5 mb-2 flex shrink-0 flex-col border border-line bg-surface"
    >
      <div className="flex min-w-0 items-center gap-3 border-b border-line-2 px-4 py-3.5">
        <CycleGlyph
          state="progress"
          progress={length ? elapsed / length : 0}
          size={12}
          className="text-accent"
        />
        <RowLink href={cycleHref(projectKey, cycle.number)} className="shrink-0 text-[15px]">
          Cycle {cycle.number}
        </RowLink>
        {cycle.name ? <span className="truncate text-muted">· {cycle.name}</span> : null}
        <Tag tone="accent">Current</Tag>
        <span className="flex-1" />
        <span className="shrink-0 text-muted">{formatRange(cycle.startsOn, cycle.endsOn)}</span>
        {cycle.daysLeft != null ? <DaysLeftPill daysLeft={cycle.daysLeft} /> : null}
        <Button
          variant="secondary"
          size="sm"
          aria-label={`Open Cycle ${cycle.number}`}
          onPress={() => void navigate({ href: cycleHref(projectKey, cycle.number) })}
        >
          Open
        </Button>
      </div>
      <StatStrip variant="inset" aria-label={`Cycle ${cycle.number} numbers`}>
        <StatTile label="Scope" value={scope} sub={`${counts.addedAfterStart} added after start`} />
        <StatTile label="Done" value={counts.done} sub={`${percent}%`} />
        <StatTile label="In progress" value={inProgress} sub={`${counts.in_review} in review`} />
        <StatTile label="Todo" value={todo} sub={`${counts.unassigned} unassigned`} />
        <StatTile
          label="Agents"
          value={counts.agents}
          sub={`of ${scope} ${scope === 1 ? 'task' : 'tasks'}`}
        />
      </StatStrip>
      <CycleBars cycle={cycle} className="border-t border-line-2 px-4 py-3" />
    </section>
  );
}

/** Time and Done bars of a current cycle. */
export function CycleBars({
  cycle,
  className,
  barWidth,
  note,
}: {
  cycle: Cycle;
  className?: string;
  /** Fixed bar width in px (the cycle page); fills the row otherwise. */
  barWidth?: number;
  /** Text after the Done count. */
  note?: string;
}) {
  const { counts } = cycle;
  const scope = counts.total;
  const total = lengthInDays(cycle.startsOn, cycle.endsOn);
  const elapsed = Math.min(elapsedDays(cycle), total);
  // Label, bar, count (fixed width so both bars line up), then the note on the cycle page.
  const columns = barWidth ? `48px ${barWidth}px 44px minmax(0,1fr)` : '48px minmax(0,1fr) 44px';
  const count = 'font-mono text-[10.5px] whitespace-nowrap text-muted';
  return (
    <div
      className={`grid items-center gap-x-3 gap-y-1.5 text-[11.5px] text-muted ${className ?? ''}`}
      style={{ gridTemplateColumns: columns }}
    >
      <span>Time</span>
      <TimeBar elapsedDays={elapsed} totalDays={total} />
      <span aria-hidden className={count}>
        {elapsed}/{total}d
      </span>
      {barWidth ? <span /> : null}
      <span>Done</span>
      <ProgressBar
        size="md"
        done={counts.done}
        inProgress={counts.in_progress + counts.in_review}
        total={scope}
        label="Done"
      />
      <span aria-hidden className={count}>
        {counts.done}/{scope}
      </span>
      {barWidth ? <span className="truncate">{note}</span> : null}
    </div>
  );
}

function CurrentCardSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading cycles"
      className="mx-6 mt-5 border border-line bg-surface"
    >
      <div className="border-b border-line-2 px-4 py-3.5">
        <Skeleton width={180} height={12} />
      </div>
      <div className="flex h-[72px] gap-10 p-4">
        <Skeleton width={60} height={24} />
        <Skeleton width={60} height={24} />
        <Skeleton width={60} height={24} />
      </div>
      <div className="px-4 py-3">
        <Skeleton height={6} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

function CycleRow({ projectKey, cycle, today }: { projectKey: string; cycle: Cycle; today: string | null }) {
  const href = cycleHref(projectKey, cycle.number);
  const completed = cycle.state === 'completed';
  const summary = cycle.summary;
  return (
    <ListRow template={TEMPLATE} href={href} minHeight={44}>
      <ListCell className="flex items-center gap-2">
        <CycleGlyph state={completed ? 'done' : cycle.state === 'current' ? 'progress' : 'empty'} />
        <RowLink href={href}>{cycleTitle(cycle)}</RowLink>
      </ListCell>
      <ListCell className="text-muted">
        {formatRange(cycle.startsOn, cycle.endsOn, today ?? undefined)}
      </ListCell>
      <ListCell className="font-mono text-[10.5px] text-muted">
        {completed && summary ? summary.scope : cycle.counts.total}
      </ListCell>
      <ListCell>
        {completed ? (
          <span className="flex items-center gap-1.5 text-[12px] whitespace-nowrap text-muted">
            <StatusSquare status="done" />
            {summary?.completed ?? cycle.counts.done} done
            {summary?.rolledOver ? (
              <span className="text-warn">· {summary.rolledOver} rolled over</span>
            ) : null}
          </span>
        ) : (
          <span className="text-faint">{today ? describeStart(cycle.startsOn, today) : ''}</span>
        )}
      </ListCell>
      <RowChevron />
    </ListRow>
  );
}
