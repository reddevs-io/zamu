import type { ReactNode } from 'react';
import { Avatar } from '../Avatar';
import { cn } from '../cn';
import { Rail, type RailNavItem } from '../layout/Rail';
import { MentionChip } from '../MentionChip';
import { CycleGlyph, MilestoneGlyph } from '../PlanningGlyph';
import { PriorityGlyph } from '../PriorityGlyph';
import { ProgressBar } from '../Progress';
import {
  QUEUE_COLUMNS,
  Queue,
  QueueGroupFooter,
  QueueGroupHeader,
  QueueRow,
  type QueueRowProps,
} from '../Queue';
import { StatusSquare } from '../StatusSquare';
import { WarnPill } from '../WarnPill';

/**
 * /__ui frame for the M4 kit additions, laid out like .agent/design/m4/screens/01-0-M4Kit-light.png and
 * 02-0-M4Kit-dark.png (1280 wide, top part: group header, rail item, queue rows), then the warning pill
 * and the queue surface. The cells inside the rows are sample markup: the dashboard screen owns them.
 */
export function M4Gallery() {
  return (
    <section
      aria-label="M4 kit"
      data-frame="m4-kit"
      className="flex w-[1280px] flex-col gap-[30px] px-8 py-7"
    >
      <div className="grid grid-cols-2 gap-8">
        <div>
          <H>Queue group header</H>
          <div className="border border-line bg-surface">
            <QueueGroupHeader
              kind="review"
              label="In review"
              count={12}
              showAll={{ label: 'Show all 12', onPress: () => {} }}
              hotkey="1"
            />
            <QueueGroupHeader kind="mention" label="Mentions" count={2} hotkey="2" />
            <QueueGroupHeader
              kind="stalled"
              label="Stalled"
              count={0}
              emptyText="Nothing stalled"
              hotkey="3"
            />
            <QueueGroupHeader kind="deadline" label="Deadlines" count={2} hotkey="4" className="border-b-0" />
          </div>
          <Note className="mt-1.5">
            An empty group keeps its place as one quiet line, so the layout doesn't jump when an item clears
            during a refresh, and 1 to 4 always jump to the same group. Shape tells the groups apart: square,
            @, half-filled square, diamond.
          </Note>
        </div>
        <div>
          <H>Rail: Dashboard item</H>
          <div className="flex items-start gap-3.5">
            <RailDemo count={8} isCurrent caption="On, 8" />
            <RailDemo count={7} caption="Off, 7" />
            <RailDemo count={0} caption="Off, 0" />
            <RailDemo count={140} isCurrent caption="On, 99+" />
          </div>
          <Note className="mt-2">
            The count sits under the label, like the open counts under project keys. It is the same number as
            the queue header in Mine. No count at 0; 99+ above 99. The Ledger rail has one width, so there is
            no collapsed form.
          </Note>
        </div>
      </div>

      <div>
        <H>Queue rows</H>
        <div className="border border-line bg-surface">
          <Lab>Task row: default, hover, keyboard focus, selected (panel open)</Lab>
          <TaskRow />
          <TaskRow isHovered />
          <TaskRow isFocused />
          <TaskRow isSelected />
          <Lab>Mention row: two lines, excerpt clamps to one</Lab>
          <MentionRow />
          <Lab>Stalled row: the pill names the silence</Lab>
          <TaskRow
            status="in_progress"
            id="PAY-139"
            title="Stream invoice PDFs instead of buffering them in memory"
            priority="medium"
            meta={<WarnPill>no update 26h</WarnPill>}
          />
          <Lab>Deadline rows: milestone and cycle</Lab>
          <DeadlineRow
            glyph={<MilestoneGlyph filled className="ml-[3px] text-warn" />}
            projectKey="PAY"
            name="PCI audit"
            kind="milestone · target Oct 12"
            done={7}
            total={11}
            open="4 open tasks"
            pill="11 days overdue"
          />
          <DeadlineRow
            glyph={<CycleGlyph state="progress" progress={0.63} className="ml-0.5 text-warn" />}
            projectKey="WEB"
            name="Cycle 4"
            kind="cycle · Oct 12 – Oct 24"
            done={12}
            total={19}
            open="7 open tasks"
            pill="ends tomorrow"
            className="border-b-0"
          />
        </div>
      </div>

      <div className="grid grid-cols-[300px_minmax(0,1fr)] gap-8">
        <div>
          <H>Warning pill</H>
          <div className="flex flex-wrap items-center gap-2">
            <WarnPill>no update 26h</WarnPill>
            <WarnPill>11 days overdue</WarnPill>
            <WarnPill>ends tomorrow</WarnPill>
            <WarnPill>Stalled 26h</WarnPill>
          </div>
          <Note className="mt-2">
            --warn on --warn-bg, 18px, 10.5px semibold. Stalled rows, overdue milestones, cycles that end
            soon, stalled agents.
          </Note>
        </div>
        <div>
          <H>Queue surface</H>
          <Queue
            title="Needs you"
            count={120}
            note="Assigned to you, your agents, and mentions of you. Items leave when they are handled."
          >
            <QueueGroupHeader kind="review" label="In review" count={120} hotkey="1" />
            <TaskRow columns={QUEUE_COLUMNS.wide} tabIndex={0} data-demo="live-row" />
            <QueueGroupFooter action={{ label: 'Collapse', onPress: () => {} }}>
              Showing 50 of 120. The rest stay here until they clear.
            </QueueGroupFooter>
            <QueueGroupHeader
              kind="mention"
              label="Mentions"
              count={0}
              emptyText="No open questions"
              hotkey="2"
            />
            <QueueGroupHeader
              kind="stalled"
              label="Stalled"
              count={0}
              emptyText="Nothing stalled"
              hotkey="3"
            />
            <QueueGroupHeader
              kind="deadline"
              label="Deadlines"
              count={0}
              emptyText="No deadlines in the next 2 days"
              hotkey="4"
              className="border-b-0"
            />
          </Queue>
        </div>
      </div>
    </section>
  );
}

function H({ children }: { children: ReactNode }) {
  return <h2 className="m-0 mb-2 text-[13px] font-semibold">{children}</h2>;
}

function Note({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn('m-0 text-[11.5px] leading-normal text-pretty text-muted', className)}>{children}</p>
  );
}

function Lab({ children }: { children: ReactNode }) {
  return <div className="caps pt-1.5 pb-1 pl-4">{children}</div>;
}

const countLabel = (n: number) => `${n} ${n === 1 ? 'item needs' : 'items need'} you`;

function RailDemo({ count, isCurrent, caption }: { count: number; isCurrent?: boolean; caption: string }) {
  const nav: RailNavItem[] = [
    { id: 'dashboard', label: 'Dashboard', href: '/__ui', isCurrent, count, countLabel },
    { id: 'my-tasks', label: 'My tasks', href: '/__ui' },
  ];
  return (
    <div>
      {/* Cropped under My tasks, like the kit frame: the spacer pushes the avatar out of view. */}
      <div className="h-[146px] w-16 overflow-hidden">
        <Rail
          workspace={{ name: 'Reddevs', initial: 'R' }}
          nav={nav}
          user={{ name: 'Ana Ruiz', hue: 25 }}
          className="h-[400px] w-16 overflow-visible"
        />
      </div>
      <div className="mt-1.5 w-16 text-center text-[10.5px] text-muted">{caption}</div>
    </div>
  );
}

function ProjectCell({ projectKey, name }: { projectKey: string; name: string }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="shrink-0 border border-line px-1 font-mono text-[9.5px] leading-[15px] text-muted">
        {projectKey}
      </span>
      <span className="truncate text-[12px] text-muted">{name}</span>
    </span>
  );
}

function Who() {
  return (
    <span className="flex min-w-0 items-center gap-1.5 overflow-hidden text-[12px] whitespace-nowrap text-muted">
      <Avatar name="claude-dev" kind="agent" initials="C" decorative />
      <span className="text-fg">claude-dev</span>
      <span className="text-[11.5px]">for Ana Ruiz</span>
    </span>
  );
}

function Meta({ children }: { children: ReactNode }) {
  return (
    <span className="flex items-center justify-end gap-1.5 font-mono text-[10px] whitespace-nowrap text-faint">
      {children}
    </span>
  );
}

function TaskRow({
  status = 'in_review',
  id = 'PAY-140',
  title = 'Retry failed webhook deliveries with exponential backoff',
  priority = 'high',
  meta = 'in review 3h',
  columns = QUEUE_COLUMNS.wide,
  ...row
}: {
  status?: 'in_review' | 'in_progress';
  id?: string;
  title?: string;
  priority?: 'high' | 'medium';
  meta?: ReactNode;
} & QueueRowProps) {
  return (
    <QueueRow columns={columns} {...row}>
      <StatusSquare status={status} />
      <span className="font-mono text-[10.5px] text-muted">{id}</span>
      <span className="truncate">{title}</span>
      <ProjectCell projectKey="PAY" name="Payments" />
      <Who />
      <PriorityGlyph priority={priority} />
      <Meta>{meta}</Meta>
    </QueueRow>
  );
}

function MentionRow() {
  return (
    <QueueRow columns={QUEUE_COLUMNS.wide} twoLine>
      <Avatar name="claude-dev" kind="agent" initials="C" />
      <span className="font-mono text-[10.5px] text-muted">PAY-140</span>
      <span className="flex min-w-0 flex-col gap-[3px]">
        <span className="flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap">
          <b className="font-semibold">claude-dev</b>
          <span className="text-[11.5px] text-muted">for Ana Ruiz</span>
          <span className="text-faint">on</span>
          <span className="truncate text-muted">
            Retry failed webhook deliveries with exponential backoff
          </span>
        </span>
        <span className="min-w-0 truncate text-[12.5px] text-muted">
          <MentionChip name="Ana Ruiz" /> the retry cap is 24 hours now. Should deliveries that still fail
          after that go to the dead-letter queue?
        </span>
      </span>
      <ProjectCell projectKey="PAY" name="Payments" />
      <span className="text-[12px] text-faint">Agent asks</span>
      <PriorityGlyph priority="high" />
      <Meta>25m</Meta>
    </QueueRow>
  );
}

function DeadlineRow({
  glyph,
  projectKey,
  name,
  kind,
  done,
  total,
  open,
  pill,
  className,
}: {
  glyph: ReactNode;
  projectKey: string;
  name: string;
  kind: string;
  done: number;
  total: number;
  open: string;
  pill: string;
  className?: string;
}) {
  return (
    <QueueRow columns={QUEUE_COLUMNS.wide} className={className}>
      {glyph}
      <span className="font-mono text-[10.5px] text-muted">{projectKey}</span>
      <span className="flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap">
        <b className="font-semibold">{name}</b>
        <span className="text-[12px] text-faint">{kind}</span>
      </span>
      <ProgressBar done={done} total={total} showCount />
      <span className="text-[12px] text-muted">{open}</span>
      <span />
      <Meta>
        <WarnPill>{pill}</WarnPill>
      </Meta>
    </QueueRow>
  );
}
