// pm backlog status | refresh: the Backlog.md source of a mirrored project (M3).
import {
  BACKLOG_MODE_LABELS,
  BACKLOG_STATE_LABELS,
  BACKLOG_TRIGGER_LABELS,
  type BacklogProblem,
  type BacklogRefreshResult,
  BacklogSourceStatus,
  type BacklogState,
  CLI_BACKLOG_REFRESH_WAIT_MS,
  type CliBacklogRefreshOutcome,
  GetBacklogStatusInput,
  GIT_CONNECTION_STATUS_LABELS,
  MAX_BACKLOG_PROBLEM_LIMIT,
  RefreshBacklogInput,
} from '@pm/contracts';
import type { ApiClient } from '../client';
import { type CommandContext, emit } from '../context';
import { fields, formatTime, type Style } from '../format';
import { requireProject } from '../project';
import { parseInput } from './shared';

/** Time between two status checks of pm backlog refresh --wait. */
export const BACKLOG_POLL_INTERVAL_MS = 2_000;

/** Pages of problems pm backlog status --problems reads at most (200 each). */
const MAX_PROBLEM_PAGES = 50;

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** "1 file, 2 values", or "none". */
function problemCounts(counts: { files: number; values: number }): string {
  const parts = [];
  if (counts.files) parts.push(plural(counts.files, 'file'));
  if (counts.values) parts.push(plural(counts.values, 'value'));
  return parts.length ? parts.join(', ') : 'none';
}

function problemLine(item: BacklogProblem): string {
  if (item.kind === 'file') {
    return `file   ${item.path}${item.skipped ? ' (skipped)' : ''}: ${item.message}`;
  }
  return `value  ${plural(item.count, 'task')}: ${item.message}`;
}

/** The status as label/value lines, then the problems when asked or listed. */
function statusText(status: BacklogSourceStatus, style: Style, withProblems: boolean): string {
  const entries: [string, string][] = [['State', BACKLOG_STATE_LABELS[status.state]]];
  if (status.repository) entries.push(['Repository', status.repository]);
  const where = [status.defaultBranch, status.folder ? `folder ${status.folder}` : null].filter(Boolean);
  if (where.length) entries.push(['Branch', where.join(' · ')]);
  if (status.connection) {
    const c = status.connection;
    entries.push(['Connection', `${c.name} · ${c.host} · ${GIT_CONNECTION_STATUS_LABELS[c.status]}`]);
  } else if (status.state !== 'detached') {
    entries.push(['Connection', 'none: choose one in the project settings']);
  }
  if (status.lastRead) {
    const read = status.lastRead;
    const title = read.commitTitle ? ` "${read.commitTitle}"` : '';
    const trigger = read.trigger ? ` · ${BACKLOG_TRIGGER_LABELS[read.trigger]}` : '';
    entries.push(['Last read', `${formatTime(read.at)} · ${read.commit.slice(0, 7)}${title}${trigger}`]);
  } else {
    entries.push(['Last read', 'not yet']);
  }
  if (status.lastAttemptAt && status.lastAttemptAt !== status.lastRead?.at) {
    entries.push(['Last attempt', formatTime(status.lastAttemptAt)]);
  }
  if (status.lastError) entries.push(['Last error', status.lastError]);
  if (status.nextPollAt) entries.push(['Next check', formatTime(status.nextPollAt)]);
  if (status.state !== 'detached') {
    entries.push([
      'Webhook',
      status.webhookLastAt ? `last notification ${formatTime(status.webhookLastAt)}` : 'no notification yet',
    ]);
  }
  if (status.detachedAt) {
    const by = status.detachedBy ? ` by ${status.detachedBy.name}` : '';
    entries.push(['Detached', `${formatTime(status.detachedAt)}${by}`]);
  }
  const c = status.counts;
  entries.push([
    'Tasks',
    [
      `${c.tasks} (${c.open} open)`,
      plural(c.subtasks, 'subtask'),
      plural(c.drafts, 'draft'),
      `${c.archived} archived`,
      `${c.hidden} hidden`,
      plural(c.milestones, 'milestone'),
    ].join(' · '),
  ]);
  const counts = status.problems.counts;
  const total = counts.files + counts.values;
  entries.push([
    'Problems',
    total && !withProblems
      ? `${problemCounts(counts)} · pm backlog status --problems lists them`
      : problemCounts(counts),
  ]);

  const mode = BACKLOG_MODE_LABELS[status.mode].toLowerCase();
  const head = `${style.bold(status.project.key)}  ${status.project.name} · Backlog.md ${mode}\n`;
  const parts = [head, fields(entries, style)];
  if (withProblems && status.problems.items.length) {
    parts.push(`\n${style.dim('Problems')}\n`);
    parts.push(`${status.problems.items.map((item) => `  ${problemLine(item)}`).join('\n')}\n`);
  }
  return parts.join('');
}

/** The status with every problem: the pages after the first, joined. */
async function statusWithAllProblems(client: ApiClient, project: string): Promise<BacklogSourceStatus> {
  const first = BacklogSourceStatus.parse(
    await client.backlog.status(
      parseInput(GetBacklogStatusInput, { project, problemsLimit: MAX_BACKLOG_PROBLEM_LIMIT }),
    ),
  );
  const items = [...first.problems.items];
  let cursor = first.problems.nextCursor;
  for (let page = 1; cursor && page < MAX_PROBLEM_PAGES; page++) {
    const next = await client.backlog.status(
      parseInput(GetBacklogStatusInput, {
        project,
        problemsCursor: cursor,
        problemsLimit: MAX_BACKLOG_PROBLEM_LIMIT,
      }),
    );
    items.push(...next.problems.items);
    cursor = next.problems.nextCursor;
  }
  return { ...first, problems: { ...first.problems, items, nextCursor: cursor } };
}

// ---------------------------------------------------------------------------
// pm backlog status
// ---------------------------------------------------------------------------

export interface StatusOptions {
  project?: string;
  problems?: boolean;
}

export async function backlogStatus(context: CommandContext, options: StatusOptions): Promise<void> {
  const project = await requireProject(context, options.project);
  context.target = { ...context.target, project };
  const input = parseInput(GetBacklogStatusInput, { project });
  const client = await context.client();
  const status = options.problems
    ? await statusWithAllProblems(client, input.project)
    : await client.backlog.status(input);
  emit(context, 'backlog.status', status, (data) =>
    statusText(data, context.style, options.problems === true),
  );
}

// ---------------------------------------------------------------------------
// pm backlog refresh
// ---------------------------------------------------------------------------

export interface RefreshOptions {
  project?: string;
  wait?: boolean;
}

/** States in which a run is still going (or has not started its first read). */
const RUNNING_STATES = new Set<BacklogState>(['reading', 'setup']);

const time = (iso: string | null | undefined) => (iso ? Date.parse(iso) : Number.NEGATIVE_INFINITY);

/**
 * The run started by the request has ended: the source is no longer reading, and its last attempt
 * (or last read) is newer than when the refresh was requested.
 */
export function refreshEnded(request: BacklogRefreshResult, status: BacklogSourceStatus): boolean {
  if (status.state === 'detached') return true;
  if (RUNNING_STATES.has(status.state)) return false;
  const before = time(request.lastAttemptAt);
  return time(status.lastAttemptAt) > before || time(status.lastRead?.at) > before;
}

function refreshText(
  key: string,
  data: BacklogRefreshResult & { outcome: CliBacklogRefreshOutcome; status: BacklogSourceStatus | null },
  style: Style,
): string {
  const project = style.bold(key);
  if (data.outcome === 'queued') {
    const head = data.queued
      ? `Queued a refresh of ${project} from Backlog.md.`
      : `A refresh of ${project} is already queued.`;
    return `${head}\n${style.dim('pm backlog status shows the result; --wait waits for it.')}\n`;
  }
  const status = data.status;
  if (data.outcome === 'timeout' || !status) {
    return `No refresh of ${project} finished within ${CLI_BACKLOG_REFRESH_WAIT_MS / 60_000} minutes. It may still run: check pm backlog status later, and that the worker is running.\n`;
  }
  const commit = status.lastRead ? ` at ${status.lastRead.commit.slice(0, 7)}` : '';
  // Every task the project holds from the files: tasks/, drafts and archived ones (as on the web).
  const { tasks, drafts, archived, milestones } = status.counts;
  const total = tasks + drafts + archived;
  const counts = `${total} ${total === 1 ? 'task' : 'tasks'}, ${milestones} ${milestones === 1 ? 'milestone' : 'milestones'}`;
  switch (status.state) {
    case 'healthy':
      return `Refreshed ${project}: read Backlog.md${commit}, ${counts}, no problems.\n`;
    case 'warnings':
      return `Refreshed ${project}: read Backlog.md${commit}, ${counts}, problems: ${problemCounts(status.problems.counts)}.\n${style.dim('pm backlog status --problems lists them.')}\n`;
    case 'failed':
      return `The refresh of ${project} failed: ${status.lastError ?? 'no reason given'}\n${style.dim('The last good read is kept.')}\n`;
    case 'paused':
      return `The Backlog.md mirror of ${project} paused: ${status.lastError ?? 'no reason given'}\n`;
    default:
      return `The refresh of ${project} ended: ${BACKLOG_STATE_LABELS[status.state]}.\n`;
  }
}

export async function backlogRefresh(context: CommandContext, options: RefreshOptions): Promise<void> {
  const project = await requireProject(context, options.project);
  context.target = { ...context.target, project };
  const input = parseInput(RefreshBacklogInput, { project });
  const client = await context.client();
  const request = await client.backlog.refresh(input);

  let outcome: CliBacklogRefreshOutcome = 'queued';
  let status: BacklogSourceStatus | null = null;
  if (options.wait) {
    const { io } = context;
    const now = io.now ?? Date.now;
    const sleep = io.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
    const deadline = now() + CLI_BACKLOG_REFRESH_WAIT_MS;
    if (!context.json && io.isTTY) {
      io.stderr(`Waiting for the refresh of ${request.project} (up to 5 minutes)...\n`);
    }
    for (;;) {
      await sleep(BACKLOG_POLL_INTERVAL_MS);
      status = BacklogSourceStatus.parse(
        await client.backlog.status(parseInput(GetBacklogStatusInput, { project: request.project })),
      );
      if (refreshEnded(request, status)) {
        outcome = 'finished';
        break;
      }
      if (now() >= deadline) {
        outcome = 'timeout';
        break;
      }
    }
  }
  emit(context, 'backlog.refresh', { ...request, outcome, status }, (data) =>
    refreshText(request.project, data, context.style),
  );
}
