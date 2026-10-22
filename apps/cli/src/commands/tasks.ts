// pm tasks list | show | create | update.
import {
  ASSIGNEE_AGENTS,
  ASSIGNEE_ME,
  CreateTaskInput,
  GetTaskInput,
  ListTasksInput,
  MemberList,
  TASK_STATUSES,
  type Task,
  UpdateTaskInput,
  UserId,
} from '@pm/contracts';
import type { z } from 'zod';
import type { ApiClient } from '../client';
import { type CommandContext, emit } from '../context';
import { inputError, notFoundError, usageError } from '../errors';
import {
  activitySentence,
  assigneeLabel,
  fields,
  formatTime,
  personLabel,
  priorityLabel,
  statusLabel,
  table,
} from '../format';

/** `In progress`, `in-progress` and `IN_PROGRESS` all mean in_progress. */
export function normalizeChoice(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

/** Commander collector for repeatable, comma-separated options (`--status todo,in_progress`). */
export function collectList(value: string, previous: string[] = []): string[] {
  return [...previous, ...value.split(',').map(normalizeChoice).filter(Boolean)];
}

function parseInput<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw inputError(parsed.error);
  return parsed.data;
}

async function readText(context: CommandContext, value: string): Promise<string> {
  return value === '-' ? context.io.readStdin() : value;
}

/**
 * Resolves an --assignee value to what the API takes: `me`, `agents` (list filter only), a user id,
 * or a member name or email looked up through GET /members.
 */
export async function resolveAssignee(
  client: ApiClient,
  value: string,
  { allowAgents }: { allowAgents: boolean },
): Promise<string> {
  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();
  if (lower === ASSIGNEE_ME) return ASSIGNEE_ME;
  if (lower === ASSIGNEE_AGENTS) {
    if (allowAgents) return ASSIGNEE_AGENTS;
    throw usageError('--assignee agents only filters pm tasks list. Name one agent instead.');
  }
  if (UserId.safeParse(trimmed).success) return trimmed;

  const members = MemberList.parse(await client.members.list()).items;
  const matches = members.filter(
    (member) => member.name.toLowerCase() === lower || member.email?.toLowerCase() === lower,
  );
  if (matches.length === 1) return (matches[0] as (typeof matches)[number]).id;
  if (matches.length === 0) {
    throw notFoundError(`No workspace member named "${trimmed}".`, [
      `Members: ${members.map((member) => member.name).join(', ') || 'none'}`,
    ]);
  }
  throw usageError(`More than one member is named "${trimmed}". Pass the user id instead.`, undefined, [
    ...matches.map((member) => `${member.id}  ${personLabel(member)}`),
  ]);
}

function taskSummary(context: CommandContext, verb: string, task: Task): string {
  const { style } = context;
  const head = `${verb} ${style.bold(task.key)}  ${task.title}`;
  return `${head}\n${fields(
    [
      ['Status', style.status(task.status, statusLabel(task.status))],
      ['Priority', style.priority(task.priority, priorityLabel(task.priority))],
      ['Assignee', assigneeLabel(task.assignee)],
    ],
    style,
  )}`;
}

// ---------------------------------------------------------------------------
// pm tasks list
// ---------------------------------------------------------------------------

export interface ListOptions {
  project: string;
  status?: string[];
  assignee?: string;
  limit?: string;
  cursor?: string;
}

export async function listTasks(context: CommandContext, options: ListOptions): Promise<void> {
  const draft = {
    project: options.project,
    ...(options.status?.length ? { status: options.status } : {}),
    ...(options.limit !== undefined ? { limit: options.limit } : {}),
    ...(options.cursor !== undefined ? { cursor: options.cursor } : {}),
  };
  // Validate what we can before touching the network (and before resolving names).
  parseInput(ListTasksInput, draft);
  const client = await context.client();
  const assignee =
    options.assignee === undefined
      ? undefined
      : await resolveAssignee(client, options.assignee, { allowAgents: true });
  const input = parseInput(ListTasksInput, { ...draft, ...(assignee ? { assignee } : {}) });
  const page = await client.tasks.list(input);

  emit(context, 'tasks.list', page, (data) => {
    const { style } = context;
    if (data.items.length === 0) return `No tasks in ${input.project} match.\n`;
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

export async function showTask(context: CommandContext, key: string): Promise<void> {
  const input = parseInput(GetTaskInput, { key });
  const client = await context.client();
  const [task, activity] = await Promise.all([client.tasks.get(input), client.tasks.activity(input)]);

  emit(context, 'tasks.show', { task, activity: activity.items }, (data) => {
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
          ['Project', `${t.project.key}  ${t.project.name}`],
          ['Created', `${formatTime(t.createdAt)} by ${createdBy}`],
          ['Updated', formatTime(t.updatedAt)],
        ],
        style,
      ),
    ];
    if (t.description?.trim()) parts.push(`\n${t.description.replace(/\s+$/, '')}\n`);
    if (data.activity.length) {
      parts.push(`\n${style.dim('Activity')}\n`);
      parts.push(
        data.activity
          .map((entry) => `${style.dim(formatTime(entry.createdAt))}  ${activitySentence(entry)}`)
          .join('\n'),
        '\n',
      );
    }
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
}

export async function createTask(
  context: CommandContext,
  titleWords: string[],
  options: CreateOptions,
): Promise<void> {
  const draft = {
    project: options.project,
    title: titleWords.join(' '),
    ...(options.description !== undefined
      ? { description: await readText(context, options.description) }
      : {}),
    ...(options.priority !== undefined ? { priority: normalizeChoice(options.priority) } : {}),
    ...(options.status !== undefined ? { status: normalizeChoice(options.status) } : {}),
  };
  parseInput(CreateTaskInput, draft);
  const client = await context.client();
  const assignee =
    options.assignee === undefined
      ? undefined
      : await resolveAssignee(client, options.assignee, { allowAgents: false });
  const input = parseInput(CreateTaskInput, { ...draft, ...(assignee ? { assignee } : {}) });
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
}

export async function updateTask(
  context: CommandContext,
  key: string,
  options: UpdateOptions,
): Promise<void> {
  if (options.assignee !== undefined && options.unassign) {
    throw usageError('Use either --assignee or --unassign, not both.');
  }
  const draft = {
    key,
    ...(options.title !== undefined ? { title: options.title } : {}),
    ...(options.description !== undefined
      ? { description: await readText(context, options.description) }
      : {}),
    ...(options.status !== undefined ? { status: normalizeChoice(options.status) } : {}),
    ...(options.priority !== undefined ? { priority: normalizeChoice(options.priority) } : {}),
    ...(options.unassign ? { assignee: null } : {}),
  };
  // `me` stands in for a name still to be resolved, so "change at least one field" passes.
  parseInput(UpdateTaskInput, options.assignee !== undefined ? { ...draft, assignee: ASSIGNEE_ME } : draft);
  const client = await context.client();
  const assignee =
    options.assignee === undefined
      ? undefined
      : await resolveAssignee(client, options.assignee, { allowAgents: false });
  const input = parseInput(UpdateTaskInput, { ...draft, ...(assignee ? { assignee } : {}) });
  const task = await client.tasks.update(input);
  emit(context, 'tasks.update', task, (data) => taskSummary(context, 'Updated', data));
}
