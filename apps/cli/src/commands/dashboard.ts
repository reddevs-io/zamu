// pm dashboard [--everyone]: the action queue, the project rows and the agents in one screen.
import type {
  Dashboard,
  DashboardProject,
  DashboardScope,
  DeadlineItem,
  MentionItem,
  ReviewItem,
  StalledItem,
} from '@pm/contracts';
import { type CommandContext, emit } from '../context';
import { elapsed, type GridColumn, grid, personLabel, type Style } from '../format';

/** Items printed per queue group; the rest is counted in a "… N more" line. */
export const DASHBOARD_LINES_PER_GROUP = 10;

const INDENT = '  ';

/** daysLeft up to which a current cycle shows in Deadlines: today and the next 2 days. */
const DEADLINE_WINDOW_DAYS = 3;

interface Section<Item> {
  title: string;
  group: { total: number; items: Item[] };
  columns: GridColumn<Item>[];
}

function section<Item>(
  { title, group, columns }: Section<Item>,
  style: Style,
  maxWidth: number | undefined,
): string {
  if (group.total === 0) return `${style.bold(title)} ${style.dim('· none')}\n`;
  const shown = group.items.slice(0, DASHBOARD_LINES_PER_GROUP);
  const more = group.total - shown.length;
  const rows = grid(shown, columns, style, {
    header: false,
    indent: INDENT,
    ...(maxWidth ? { maxWidth } : {}),
  });
  return `${style.bold(`${title} · ${group.total}`)}\n${rows}${more > 0 ? `${INDENT}${style.dim(`… ${more} more`)}\n` : ''}`;
}

/** "ends today" on the last day (daysLeft 1), "ends tomorrow", then "ends in 2 days". */
function endsLabel(daysLeft: number): string {
  if (daysLeft <= 1) return 'ends today';
  if (daysLeft === 2) return 'ends tomorrow';
  return `ends in ${daysLeft - 1} days`;
}

function deadlineName(item: DeadlineItem): string {
  if (item.kind === 'milestone') return `Milestone ${item.milestone.name}`;
  return item.cycle.name ? `Cycle ${item.cycle.number} · ${item.cycle.name}` : `Cycle ${item.cycle.number}`;
}

function deadlineReason(item: DeadlineItem): string {
  if (item.kind === 'cycle') return endsLabel(item.daysLeft);
  return `${item.daysOverdue} ${item.daysOverdue === 1 ? 'day' : 'days'} overdue`;
}

/** "Cycle 9 · 5/12 · 6d left" or "Cycle 4 · 12/19 · ends tomorrow"; "not used" when the project has cycles off. */
function cycleCell(project: DashboardProject): string {
  if (!project.usesCycles) return 'not used';
  const cycle = project.currentCycle;
  if (!cycle) return 'none';
  // Inside the deadline window, the same words as the Deadlines row for this cycle.
  const left = cycle.daysLeft <= DEADLINE_WINDOW_DAYS ? endsLabel(cycle.daysLeft) : `${cycle.daysLeft}d left`;
  return `Cycle ${cycle.number} · ${cycle.done}/${cycle.total} · ${left}`;
}

/** "PCI audit · 7/11 · overdue · +1" or "CLI 1.0 · 3/9 · 2026-11-30"; "not used" when the project has milestones off. */
function milestoneCell(project: DashboardProject): string {
  if (!project.usesMilestones) return 'not used';
  const milestone = project.nextMilestone;
  if (!milestone) return 'none';
  const target = milestone.overdue ? 'overdue' : (milestone.targetDate ?? 'no date');
  const others = milestone.others ? ` · +${milestone.others}` : '';
  return `${milestone.name} · ${milestone.done}/${milestone.total} · ${target}${others}`;
}

const HEADINGS: Record<DashboardScope, string> = { mine: 'Needs you', everyone: 'Needs someone' };

/** Human rendering. Relative times count from generatedAt, so the output does not depend on the local clock. */
export function dashboardText(data: Dashboard, style: Style, maxWidth?: number): string {
  const now = data.generatedAt;
  const ago = (iso: string) => `${elapsed(iso, now)} ago`;
  const { review, mentions, stalled, deadlines } = data.groups;
  const total = review.total + mentions.total + stalled.total + deadlines.total;
  const key = <Row>(value: (row: Row) => string): GridColumn<Row> => ({
    header: 'KEY',
    value,
    style: (_row, cell) => style.bold(cell),
  });

  const parts = [
    `${style.bold(`${HEADINGS[data.scope]} · ${total}`)}\n`,
    section<ReviewItem>(
      {
        title: 'In review',
        group: review,
        columns: [
          key((item) => item.task.key),
          { header: 'TITLE', value: (item) => item.task.title, flex: true },
          { header: 'WHO', value: (item) => (item.assignee ? personLabel(item.assignee) : 'Unassigned') },
          { header: 'REASON', value: (item) => `in review ${elapsed(item.since, now)}` },
        ],
      },
      style,
      maxWidth,
    ),
    section<MentionItem>(
      {
        title: 'Mentions',
        group: mentions,
        columns: [
          key((item) => item.task.key),
          {
            header: 'WHO',
            value: (item) => {
              const author = item.onBehalfOf
                ? `${item.author.name} for ${item.onBehalfOf.name}`
                : item.author.name;
              // In Mine the mentioned member is always you.
              return data.scope === 'everyone' ? `${author} → ${item.mentioned.name}` : author;
            },
          },
          {
            header: 'EXCERPT',
            value: (item) => item.comment.excerpt.replace(/\s+/g, ' ').trim(),
            flex: true,
          },
          {
            header: 'AGE',
            value: (item) => ago(item.comment.createdAt),
            style: (_item, cell) => style.dim(cell),
          },
        ],
      },
      style,
      maxWidth,
    ),
    section<StalledItem>(
      {
        title: 'Stalled',
        group: stalled,
        columns: [
          key((item) => item.task.key),
          { header: 'TITLE', value: (item) => item.task.title, flex: true },
          { header: 'WHO', value: (item) => (item.assignee ? personLabel(item.assignee) : 'Unassigned') },
          {
            header: 'REASON',
            value: (item) => `no update ${elapsed(item.lastTouchedAt, now)}`,
            style: (_item, cell) => style.warn(cell),
          },
        ],
      },
      style,
      maxWidth,
    ),
    section<DeadlineItem>(
      {
        title: 'Deadlines',
        group: deadlines,
        columns: [
          key((item) => item.project.key),
          { header: 'NAME', value: deadlineName, flex: true },
          { header: 'DONE', value: (item) => `${item.progress.done}/${item.progress.total} done` },
          { header: 'OPEN', value: (item) => `${item.openTasks} open` },
          { header: 'REASON', value: deadlineReason, style: (_item, cell) => style.warn(cell) },
        ],
      },
      style,
      maxWidth,
    ),
  ];

  const options = { indent: INDENT, ...(maxWidth ? { maxWidth } : {}) };
  parts.push(
    data.projects.length === 0
      ? `${style.bold('Projects')} ${style.dim('· none')}\n`
      : `${style.bold(`Projects · ${data.projects.length}`)}\n${grid(
          data.projects,
          [
            key((p) => p.key),
            { header: 'NAME', value: (p) => p.name, flex: true },
            { header: 'OPEN', value: (p) => String(p.openCount) },
            { header: 'DOING', value: (p) => String(p.openCounts.in_progress) },
            { header: 'REVIEW', value: (p) => String(p.openCounts.in_review) },
            { header: 'CYCLE', value: cycleCell },
            { header: 'NEXT MILESTONE', value: milestoneCell },
            { header: 'ACTIVE', value: (p) => ago(p.lastActivityAt) },
          ],
          style,
          options,
        )}`,
  );

  parts.push(
    data.agents.length === 0
      ? `${style.bold('Agents')} ${style.dim('· none')}\n`
      : `${style.bold(`Agents · ${data.agents.length}`)}\n${grid(
          data.agents,
          [
            { header: 'AGENT', value: (a) => a.agent.name, style: (_a, cell) => style.bold(cell) },
            { header: 'FOR', value: (a) => a.agent.responsible?.name ?? '' },
            { header: 'ACTIVE', value: (a) => (a.lastActivityAt ? ago(a.lastActivityAt) : 'never') },
            { header: 'DOING', value: (a) => String(a.inProgressCount) },
            {
              header: 'CURRENT TASK',
              value: (a) => {
                if (!a.currentTask) return 'Idle';
                const task = `${a.currentTask.key} ${a.currentTask.title}`;
                return a.stalled ? `Stalled · ${task}` : task;
              },
              style: (a, cell) => (a.stalled ? style.warn(cell) : a.currentTask ? cell : style.dim(cell)),
              flex: true,
            },
          ],
          style,
          options,
        )}`,
  );

  return parts.join('\n');
}

export async function showDashboard(context: CommandContext, options: { everyone?: boolean }): Promise<void> {
  const client = await context.client();
  const dashboard = await client.dashboard.get({ scope: options.everyone ? 'everyone' : 'mine' });
  emit(context, 'dashboard', dashboard, (data) => dashboardText(data, context.style, context.io.columns));
}
