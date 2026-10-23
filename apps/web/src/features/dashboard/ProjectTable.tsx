import type { DashboardProject, DeadlineItem } from '@pm/contracts';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { daysBetween, formatDay, planningToday } from '~/features/planning/dates';
import { shortAge } from '~/features/projects/time';
import { CycleGlyph, cn, MilestoneGlyph, ProgressBar, Skeleton, WarnPill } from '~/ui';
import { cycleEnds, PROJECT_ROWS } from './model';
import { cycleTitle } from './QueueView';

// One row per project, most recently active first, whatever the scope. 12 rows, then "Show all". With the
// panel open the row drops to key, name, open and active.

const WIDE_COLUMNS = '44px minmax(0, 1fr) 44px 56px 52px 236px 252px 52px';
const PANEL_COLUMNS = '44px minmax(0, 1fr) 44px 52px';

export interface ProjectTableProps {
  projects: readonly DashboardProject[] | undefined;
  isLoading: boolean;
  wide: boolean;
  showAll: boolean;
  onShowAll: () => void;
  now: number | null;
  /** YYYY-MM-DD of the answer, for years in dates. */
  today: string | undefined;
  /** Overdue milestones the queue knows, for "11d overdue". */
  deadlines: readonly DeadlineItem[];
}

export function ProjectTable({
  projects,
  isLoading,
  wide,
  showAll,
  onShowAll,
  now,
  today,
  deadlines,
}: ProjectTableProps) {
  const columns = wide ? WIDE_COLUMNS : PANEL_COLUMNS;
  const all = projects ?? [];
  const shown = showAll ? all : all.slice(0, PROJECT_ROWS);
  return (
    <section aria-labelledby="dashboard-projects" data-section="projects">
      <SectionHeader id="dashboard-projects" title="Projects" count={isLoading ? undefined : all.length}>
        Most recently active first
      </SectionHeader>
      <div className="border-t border-line">
        <div
          aria-hidden
          style={{ gridTemplateColumns: columns }}
          className="grid h-7 items-center gap-3.5 border-b border-line px-2 text-[10px] font-semibold tracking-[0.08em] text-faint uppercase"
        >
          <span>Key</span>
          <span>Name</span>
          <span className="text-right">Open</span>
          {wide ? (
            <>
              <span className="text-right">Doing</span>
              <span className="text-right">Review</span>
              <span>Current cycle</span>
              <span>Next milestone</span>
            </>
          ) : null}
          <span className="text-right">Active</span>
        </div>
        {isLoading ? (
          <ProjectSkeleton columns={columns} wide={wide} />
        ) : (
          shown.map((project) => (
            <Link
              key={project.key}
              to="/p/$projectKey"
              params={{ projectKey: project.key }}
              style={{ gridTemplateColumns: columns }}
              data-project={project.key}
              aria-label={`${project.key} ${project.name}, ${project.openCount} open`}
              className="grid h-11 items-center gap-3.5 border-b border-line-2 px-2 text-fg no-underline outline-none hover:bg-band focus-visible:focus-ring-inset"
            >
              <span className="font-mono text-[10.5px] text-fg">{project.key}</span>
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate font-semibold">{project.name}</span>
              </span>
              <Count value={project.openCount} />
              {wide ? (
                <>
                  <Count value={project.openCounts.in_progress} />
                  <Count value={project.openCounts.in_review} />
                  <CycleCell project={project} />
                  <MilestoneCell project={project} now={now} today={today} deadlines={deadlines} />
                </>
              ) : null}
              <span className="text-right font-mono text-[10px] text-faint">
                {now != null ? shortAge(project.lastActivityAt, new Date(now)) : ''}
              </span>
            </Link>
          ))
        )}
        {!isLoading && !showAll && all.length > PROJECT_ROWS ? (
          <div className="flex h-8 items-center gap-1 border-b border-line-2 px-2 text-[11.5px] text-muted">
            <span>
              Showing {PROJECT_ROWS} of {all.length} projects ·
            </span>
            <button
              type="button"
              onClick={onShowAll}
              className="cursor-pointer text-muted outline-none hover:text-fg focus-visible:focus-ring"
            >
              Show all
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function SectionHeader({
  id,
  title,
  count,
  children,
}: {
  id: string;
  title: string;
  count?: number;
  children?: ReactNode;
}) {
  return (
    <div className="mb-2 flex items-baseline gap-2.5">
      <h2 id={id} className="m-0 text-[13px] font-semibold">
        {title}
      </h2>
      {count !== undefined ? <span className="font-mono text-[10px] text-faint">{count}</span> : null}
      {children ? <span className="ml-auto text-[11.5px] text-muted">{children}</span> : null}
    </div>
  );
}

function Count({ value }: { value: number }) {
  return (
    <span className={cn('text-right font-mono text-[11px] tabular-nums', value === 0 && 'text-faint')}>
      {value}
    </span>
  );
}

function Unused({ children }: { children: string }) {
  return <span className="truncate text-[11.5px] text-faint">{children}</span>;
}

/** Glyph, name, a 54px bar, then a pill or a mono note. */
function Plan({ glyph, name, bar, end }: { glyph: ReactNode; name: string; bar: ReactNode; end: ReactNode }) {
  return (
    <span className="grid min-w-0 grid-cols-[12px_minmax(0,1fr)_54px_auto] items-center gap-[7px] text-[12px]">
      {glyph}
      <span className="truncate">{name}</span>
      {bar}
      {end}
    </span>
  );
}

const Note = ({ children }: { children: ReactNode }) => (
  <span className="font-mono text-[10.5px] whitespace-nowrap text-muted">{children}</span>
);

function CycleCell({ project }: { project: DashboardProject }) {
  if (!project.usesCycles) return <Unused>Cycles not used</Unused>;
  const cycle = project.currentCycle;
  if (!cycle) return <span />;
  const share = cycle.total > 0 ? cycle.done / cycle.total : 0;
  const name = cycleTitle(cycle);
  return (
    <Plan
      glyph={<CycleGlyph state="progress" progress={share} className="text-muted" />}
      name={name}
      bar={
        <ProgressBar done={cycle.done} total={cycle.total} label={`${name} progress`} className="min-w-0" />
      }
      end={
        cycle.daysLeft <= 3 ? (
          <WarnPill>{cycleEnds(cycle.daysLeft)}</WarnPill>
        ) : (
          <Note>{cycle.daysLeft}d left</Note>
        )
      }
    />
  );
}

function MilestoneCell({
  project,
  now,
  today,
  deadlines,
}: {
  project: DashboardProject;
  now: number | null;
  today: string | undefined;
  deadlines: readonly DeadlineItem[];
}) {
  if (!project.usesMilestones) return <Unused>Milestones not used</Unused>;
  const milestone = project.nextMilestone;
  if (!milestone) return <span />;
  const more = milestone.others ? `+${milestone.others}` : '';
  let end: ReactNode = null;
  if (milestone.overdue) {
    const late = overdueDays(project, deadlines, now);
    end = <WarnPill>{late ? `${late}d overdue` : 'overdue'}</WarnPill>;
  } else if (milestone.targetDate) {
    end = (
      <Note>
        {more
          ? `${formatDay(milestone.targetDate, today)} · ${more}`
          : formatDay(milestone.targetDate, today)}
      </Note>
    );
  } else if (more) {
    end = <Note>{more}</Note>;
  }
  return (
    <Plan
      glyph={<MilestoneGlyph className="text-muted" />}
      name={milestone.name}
      bar={
        <ProgressBar
          done={milestone.done}
          total={milestone.total}
          label={`${milestone.name} progress`}
          className="min-w-0"
        />
      }
      end={end}
    />
  );
}

/** From the queue's deadline row when it has one, else from the browser's day. */
function overdueDays(
  project: DashboardProject,
  deadlines: readonly DeadlineItem[],
  now: number | null,
): number | null {
  const milestone = project.nextMilestone;
  if (!milestone) return null;
  const known = deadlines.find((item) => item.kind === 'milestone' && item.milestone.id === milestone.id);
  if (known?.kind === 'milestone') return known.daysOverdue;
  if (!milestone.targetDate || now == null) return null;
  const days = daysBetween(milestone.targetDate, planningToday(now, project.currentCycle));
  return days > 0 ? days : null;
}

function ProjectSkeleton({ columns, wide }: { columns: string; wide: boolean }) {
  return (
    <div aria-hidden>
      {['56%', '40%'].map((width) => (
        <div
          key={width}
          style={{ gridTemplateColumns: columns }}
          className="grid h-11 items-center gap-3.5 border-b border-line-2 px-2"
        >
          <Skeleton width={30} />
          <Skeleton width={width} />
          <Skeleton width={20} className="justify-self-end" />
          {wide ? (
            <>
              <Skeleton width={20} className="justify-self-end" />
              <Skeleton width={20} className="justify-self-end" />
              <Skeleton width={160} />
              <Skeleton width={180} />
            </>
          ) : null}
          <Skeleton width={30} className="justify-self-end" />
        </div>
      ))}
    </div>
  );
}
