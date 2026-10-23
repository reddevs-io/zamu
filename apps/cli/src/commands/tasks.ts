// pm tasks list | show | create | update.
import { ORPCError } from '@orpc/client';
import {
  ActivityList,
  ASSIGNEE_ME,
  CreateTaskInput,
  FILTER_NONE,
  GetTaskInput,
  ListTasksInput,
  parseTaskKey,
  TASK_STATUSES,
  type Task,
  Timeline,
  type TimelineItem,
  UpdateTaskInput,
} from '@pm/contracts';
import type { ApiClient } from '../client';
import { type CommandContext, emit } from '../context';
import { usageError } from '../errors';
import {
  assigneeLabel,
  cycleLabel,
  cycleStateLabel,
  fields,
  formatTime,
  milestoneStatusLabel,
  priorityLabel,
  statusLabel,
  table,
  timelineText,
} from '../format';
import {
  isNone,
  normalizeChoice,
  normalizeCycle,
  parseInput,
  readText,
  resolveAssignee,
  resolveMilestone,
} from './shared';

// Kept here for callers that imported them from this module in M1.
export { collectList, normalizeChoice, resolveAssignee } from './shared';

/** "Webhooks v2 (Active, target 2026-11-14)". */
function milestoneField(milestone: NonNullable<Task['milestone']>): string {
  const target = milestone.targetDate ? `, target ${milestone.targetDate}` : '';
  return `${milestone.name} (${milestoneStatusLabel(milestone.status)}${target})`;
}

/** "Cycle 12 · Checkout rewrite (Current, 2026-10-12 to 2026-10-25)". */
function cycleField(cycle: NonNullable<Task['cycle']>): string {
  return `${cycleLabel(cycle)} (${cycleStateLabel(cycle.state)}, ${cycle.startsOn} to ${cycle.endsOn})`;
}

/** Milestone and cycle lines, only for what the task has. */
function planningFields(task: Pick<Task, 'milestone' | 'cycle'>): [string, string][] {
  const entries: [string, string][] = [];
  if (task.milestone) entries.push(['Milestone', milestoneField(task.milestone)]);
  if (task.cycle) entries.push(['Cycle', cycleField(task.cycle)]);
  return entries;
}

function taskSummary(context: CommandContext, verb: string, task: Task): string {
  const { style } = context;
  const head = `${verb} ${style.bold(task.key)}  ${task.title}`;
  return `${head}\n${fields(
    [
      ['Status', style.status(task.status, statusLabel(task.status))],
      ['Priority', style.priority(task.priority, priorityLabel(task.priority))],
      ['Assignee', assigneeLabel(task.assignee)],
      ...planningFields(task),
    ],
    style,
  )}`;
}

/** The value of --cycle as the API takes it: a number, current, next, or null for none. */
function cycleValue(value: string): string | null {
  const cycle = normalizeCycle(value);
  return cycle === FILTER_NONE ? null : cycle;
}

// ---------------------------------------------------------------------------
// pm tasks list
// ---------------------------------------------------------------------------

export interface ListOptions {
  project?: string[];
  mine?: boolean;
  status?: string[];
  assignee?: string;
  milestone?: string;
  cycle?: string;
  limit?: string;
  cursor?: string;
}

export async function listTasks(context: CommandContext, options: ListOptions): Promise<void> {
  if (options.mine && options.assignee !== undefined) {
    throw usageError('Use either --mine or --assignee, not both.');
  }
  const projects = options.project?.length ? options.project : undefined;
  const milestoneNone = options.milestone !== undefined && isNone(options.milestone);
  const draft = {
    ...(projects ? { project: projects } : {}),
    ...(options.status?.length ? { status: options.status } : {}),
    ...(options.mine ? { assignee: ASSIGNEE_ME } : {}),
    ...(milestoneNone ? { milestone: FILTER_NONE } : {}),
    ...(options.cycle !== undefined ? { cycle: normalizeCycle(options.cycle) } : {}),
    ...(options.limit !== undefined ? { limit: options.limit } : {}),
    ...(options.cursor !== undefined ? { cursor: options.cursor } : {}),
  };
  // Validate what we can before touching the network (and before resolving names).
  const checked = parseInput(ListTasksInput, draft);
  const client = await context.client();
  const assignee =
    options.assignee === undefined
      ? undefined
      : await resolveAssignee(client, options.assignee, { allowAgents: true });
  const milestone =
    options.milestone === undefined || milestoneNone
      ? undefined
      : await resolveMilestone(
          client,
          checked.project?.length === 1 ? checked.project[0] : undefined,
          options.milestone,
        );
  const input = parseInput(ListTasksInput, {
    ...draft,
    ...(assignee ? { assignee } : {}),
    ...(milestone ? { milestone } : {}),
  });
  const page = await client.tasks.list(input);

  emit(context, 'tasks.list', page, (data) => {
    const { style } = context;
    if (data.items.length === 0) {
      return input.project ? `No tasks in ${input.project.join(', ')} match.\n` : 'No tasks match.\n';
    }
    // Milestone and cycle columns appear only when some task has one.
    const withMilestone = data.items.some((t) => t.milestone);
    const withCycle = data.items.some((t) => t.cycle);
    const rows = table(
      data.items,
      [
        { header: 'KEY', value: (t) => t.key, style: (_t, cell) => style.bold(cell) },
        {
          header: 'STATUS',
          value: (t) => statusLabel(t.status),
          style: (t, cell) => style.status(t.status, cell),
        },
        {
          header: 'PRIORITY',
          value: (t) => priorityLabel(t.priority),
          style: (t, cell) => style.priority(t.priority, cell),
        },
        { header: 'ASSIGNEE', value: (t) => assigneeLabel(t.assignee) },
        ...(withMilestone
          ? [{ header: 'MILESTONE', value: (t: (typeof data.items)[number]) => t.milestone?.name ?? '' }]
          : []),
        ...(withCycle
          ? [
              {
                header: 'CYCLE',
                value: (t: (typeof data.items)[number]) => (t.cycle ? `C${t.cycle.number}` : ''),
              },
            ]
          : []),
        { header: 'TITLE', value: (t) => t.title },
      ],
      style,
      context.io.columns,
    );
    const counts = TASK_STATUSES.filter((status) => data.counts[status] > 0)
      .map((status) => `${statusLabel(status)} ${data.counts[status]}`)
      .join(' · ');
    const footer = [`${data.items.length} shown${counts ? ` · ${counts}` : ''}`];
    if (data.nextCursor) footer.push(`More: add --cursor ${data.nextCursor}`);
    return `${rows}${style.dim(footer.join('\n'))}\n`;
  });
}

// ---------------------------------------------------------------------------
// pm tasks show
// ---------------------------------------------------------------------------

/**
 * The task's timeline. A server older than M2 has no /timeline route: fall back to the activity
 * list so pm tasks show still works there.
 */
async function loadTimeline(client: ApiClient, input: GetTaskInput): Promise<TimelineItem[]> {
  try {
    return Timeline.parse(await client.tasks.timeline(input)).items;
  } catch (error) {
    if (!(error instanceof ORPCError) || error.status !== 404) throw error;
    const activity = ActivityList.parse(await client.tasks.activity(input)).items;
    return activity.map((entry) => ({ ...entry, kind: 'activity' as const }));
  }
}

export async function showTask(context: CommandContext, key: string): Promise<void> {
  const input = parseInput(GetTaskInput, { key });
  const client = await context.client();
  const [task, timeline] = await Promise.all([client.tasks.get(input), loadTimeline(client, input)]);
  const activity = timeline.filter((item) => item.kind === 'activity');

  emit(context, 'tasks.show', { task, activity, timeline }, (data) => {
    const { style } = context;
    const t = data.task;
    const createdBy = t.createdOnBehalfOf
      ? `${t.createdBy.name} for ${t.createdOnBehalfOf.name}`
      : t.createdBy.name;
    const parts = [
      `${style.bold(t.key)}  ${style.bold(t.title)}\n`,
      fields(
        [
          ['Status', style.status(t.status, statusLabel(t.status))],
          ['Priority', style.priority(t.priority, priorityLabel(t.priority))],
          ['Assignee', assigneeLabel(t.assignee)],
          ...planningFields(t),
          ['Project', `${t.project.key}  ${t.project.name}`],
          ['Created', `${formatTime(t.createdAt)} by ${createdBy}`],
          ['Updated', formatTime(t.updatedAt)],
        ],
        style,
      ),
    ];
    if (t.description?.trim()) parts.push(`\n${t.description.replace(/\s+$/, '')}\n`);
    const history = timelineText(data.timeline ?? [], style);
    if (history) parts.push(`\n${style.dim('History')}\n`, history);
    return parts.join('');
  });
}

// ---------------------------------------------------------------------------
// pm tasks create
// ---------------------------------------------------------------------------

export interface CreateOptions {
  project: string;
  description?: string;
  priority?: string;
  assignee?: string;
  status?: string;
  milestone?: string;
  cycle?: string;
}

export async function createTask(
  context: CommandContext,
  titleWords: string[],
  options: CreateOptions,
): Promise<void> {
  const milestoneNone = options.milestone !== undefined && isNone(options.milestone);
  const draft = {
    project: options.project,
    title: titleWords.join(' '),
    ...(options.description !== undefined
      ? { description: await readText(context, options.description) }
      : {}),
    ...(options.priority !== undefined ? { priority: normalizeChoice(options.priority) } : {}),
    ...(options.status !== undefined ? { status: normalizeChoice(options.status) } : {}),
    ...(options.cycle !== undefined ? { cycle: cycleValue(options.cycle) } : {}),
  };
  const checked = parseInput(CreateTaskInput, draft);
  const client = await context.client();
  const assignee =
    options.assignee === undefined
      ? undefined
      : await resolveAssignee(client, options.assignee, { allowAgents: false });
  const milestone =
    options.milestone === undefined || milestoneNone
      ? undefined
      : await resolveMilestone(client, checked.project, options.milestone);
  const input = parseInput(CreateTaskInput, {
    ...draft,
    ...(assignee ? { assignee } : {}),
    ...(milestone ? { milestone } : {}),
  });
  const task = await client.tasks.create(input);
  emit(context, 'tasks.create', task, (data) => taskSummary(context, 'Created', data));
}

// ---------------------------------------------------------------------------
// pm tasks update
// ---------------------------------------------------------------------------

export interface UpdateOptions {
  status?: string;
  priority?: string;
  assignee?: string;
  unassign?: boolean;
  title?: string;
  description?: string;
  milestone?: string;
  cycle?: string;
}

export async function updateTask(
  context: CommandContext,
  key: string,
  options: UpdateOptions,
): Promise<void> {
  if (options.assignee !== undefined && options.unassign) {
    throw usageError('Use either --assignee or --unassign, not both.');
  }
  const milestoneNone = options.milestone !== undefined && isNone(options.milestone);
  const draft = {
    key,
    ...(options.title !== undefined ? { title: options.title } : {}),
    ...(options.description !== undefined
      ? { description: await readText(context, options.description) }
      : {}),
    ...(options.status !== undefined ? { status: normalizeChoice(options.status) } : {}),
    ...(options.priority !== undefined ? { priority: normalizeChoice(options.priority) } : {}),
    ...(options.unassign ? { assignee: null } : {}),
    ...(milestoneNone ? { milestone: null } : {}),
    ...(options.cycle !== undefined ? { cycle: cycleValue(options.cycle) } : {}),
  };
  // `me` and null stand in for names still to be resolved, so "change at least one field" passes.
  const checked = parseInput(UpdateTaskInput, {
    ...draft,
    ...(options.assignee !== undefined ? { assignee: ASSIGNEE_ME } : {}),
    ...(options.milestone !== undefined ? { milestone: null } : {}),
  });
  const client = await context.client();
  const assignee =
    options.assignee === undefined
      ? undefined
      : await resolveAssignee(client, options.assignee, { allowAgents: false });
  // Milestone names are looked up in the task's own project (PAY-142 → PAY).
  const milestone =
    options.milestone === undefined || milestoneNone
      ? undefined
      : await resolveMilestone(client, parseTaskKey(checked.key).projectKey, options.milestone);
  const input = parseInput(UpdateTaskInput, {
    ...draft,
    ...(assignee ? { assignee } : {}),
    ...(milestone ? { milestone } : {}),
  });
  const task = await client.tasks.update(input);
  emit(context, 'tasks.update', task, (data) => taskSummary(context, 'Updated', data));
}
