// Source status for GET /projects/{key}/backlog, the settings page and zamu backlog status:
// state, last read, counts, the paged problem list, mappings with counts and the history.
import {
  type BacklogConfigSummary,
  BacklogConfigSummary as BacklogConfigSummarySchema,
  BacklogProjectInput,
  BacklogSourceStatus,
  formatTaskKey,
  GetBacklogStatusInput,
  OPEN_TASK_STATUSES,
  type UserRef,
} from '@zamu/contracts';
import { type DbOrTx, schema } from '@zamu/db';
import { and, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { loadProjectActivityRows, toProjectActivities } from '../activity';
import { type Actor, authorize } from '../authz';
import type { DbContext } from '../context';
import { clockNow } from '../cycles';
import { Invalid, NotFound, parseInput } from '../errors';
import { findProjectByKey, loadBacklogSource, loadUsers, type ProjectRow, userRef } from '../internal';
import type { BacklogSourceRow } from './apply';
import { emptySeenValues, mappingsView, type SeenValues } from './mappings';
import { readStoredBlock } from './plan';
import { commitUrl, repositoryRef } from './reader';
import { nextPollAt, storedMappings, storedProblems } from './refresh';

const { gitConnection, milestone, task } = schema;

/** The project and its source after the action check. NotFound without a source. */
export async function sourceForProject(
  db: DbOrTx,
  actor: Actor,
  projectKey: string,
  action: 'backlog.read' | 'backlog.manage' | 'backlog.refresh',
  options: { forUpdate?: boolean } = {},
): Promise<{ project: ProjectRow; source: BacklogSourceRow }> {
  const projectRow = await findProjectByKey(db, actor, projectKey, options);
  authorize(actor, action, { type: 'project', projectId: projectRow.id });
  const source = await loadBacklogSource(db, projectRow.id, options);
  if (!source) throw new NotFound(`${projectRow.key} has no Backlog.md source`);
  return { project: projectRow, source };
}

interface ProblemCursor {
  offset: number;
}

function encodeCursor(cursor: ProblemCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

function decodeCursor(value: string | undefined): number {
  if (!value) return 0;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as ProblemCursor;
    if (Number.isInteger(parsed.offset) && parsed.offset >= 0) return parsed.offset;
  } catch {
    // fall through
  }
  throw new Invalid('Invalid problems cursor', {
    issues: [{ path: 'problemsCursor', message: 'Invalid cursor' }],
  });
}

/** Values the project's visible tasks carry, for mapping counts (drafts' statuses left out). */
async function seenValues(
  db: DbOrTx,
  projectId: string,
  config: BacklogConfigSummary | null,
): Promise<SeenValues> {
  const seen = emptySeenValues();
  for (const status of config?.statuses ?? []) seen.status.declare(status);
  for (const priority of config?.priorities ?? []) seen.priority.declare(priority);
  const rows = await db
    .select({ data: task.backlogData })
    .from(task)
    .where(and(eq(task.projectId, projectId), isNull(task.hiddenAt), isNotNull(task.backlogId)));
  for (const row of rows) {
    const block = readStoredBlock(row.data);
    if (!block) continue;
    if (block.kind !== 'draft') seen.status.add(block.status);
    seen.priority.add(block.priority);
    for (const assignee of block.assignees) seen.assignee.add(assignee.value);
  }
  return seen;
}

const count = (condition: ReturnType<typeof sql>) =>
  sql<number>`count(*) filter (where ${condition})`.mapWith(Number);

async function counts(db: DbOrTx, projectId: string) {
  const kind = sql`${task.backlogData}->>'kind'`;
  const visible = sql`${task.hiddenAt} is null and ${task.backlogId} is not null`;
  const [taskCounts] = await db
    .select({
      tasks: count(sql`${visible} and ${kind} = 'task'`),
      open: count(sql`${visible} and ${kind} = 'task' and ${inArray(task.status, [...OPEN_TASK_STATUSES])}`),
      drafts: count(sql`${visible} and ${kind} = 'draft'`),
      archived: count(sql`${visible} and ${kind} = 'archived'`),
      subtasks: count(sql`${visible} and ${kind} = 'task' and ${task.keySuffix} is not null`),
      hidden: count(sql`${task.hiddenAt} is not null and ${task.backlogId} is not null`),
    })
    .from(task)
    .where(eq(task.projectId, projectId));
  const [milestoneCount] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(milestone)
    .where(
      and(eq(milestone.projectId, projectId), isNotNull(milestone.backlogId), isNull(milestone.hiddenAt)),
    );
  return {
    tasks: taskCounts?.tasks ?? 0,
    open: taskCounts?.open ?? 0,
    drafts: taskCounts?.drafts ?? 0,
    archived: taskCounts?.archived ?? 0,
    subtasks: taskCounts?.subtasks ?? 0,
    milestones: milestoneCount?.n ?? 0,
    hidden: taskCounts?.hidden ?? 0,
  };
}

/** The status shape for a project and its source. */
export async function backlogStatus(
  ctx: DbContext,
  projectRow: ProjectRow,
  source: BacklogSourceRow,
  page: { cursor?: string; limit: number },
): Promise<BacklogSourceStatus> {
  const { db } = ctx;
  const config = BacklogConfigSummarySchema.safeParse(source.config);
  const summary = config.success ? config.data : null;
  const [connection] = source.connectionId
    ? await db.select().from(gitConnection).where(eq(gitConnection.id, source.connectionId)).limit(1)
    : [];
  const mappings = storedMappings(source);
  const seen = await seenValues(db, projectRow.id, summary);
  const userIds = [
    source.createdById,
    ...(source.detachedById ? [source.detachedById] : []),
    ...mappings.assignee.flatMap((row) => (row.userId ? [row.userId] : [])),
  ];
  const users = await loadUsers(db, userIds);
  const refs = new Map<string, UserRef>([...users].map(([id, row]) => [id, userRef(row)]));
  const creator = refs.get(source.createdById) ?? {
    id: source.createdById,
    name: 'Unknown',
    kind: 'person' as const,
  };

  const problems = storedProblems(source);
  const offset = decodeCursor(page.cursor);
  const items = problems.slice(offset, offset + page.limit);
  const nextOffset = offset + items.length;
  const repository = repositoryRef(projectRow.repository);
  const failedAttempt = source.state === 'failed' || source.state === 'paused';
  const history = await toProjectActivities(db, await loadProjectActivityRows(db, projectRow.id));

  return BacklogSourceStatus.parse({
    id: source.id,
    nextTaskKey: formatTaskKey(projectRow.key, projectRow.nextTaskNumber),
    project: { id: projectRow.id, key: projectRow.key, name: projectRow.name },
    mode: source.mode,
    state: source.state,
    repository: projectRow.repository,
    defaultBranch: source.defaultBranch,
    folder: source.folder,
    folderOverride: source.folderOverride,
    prefix: source.prefix,
    connection: connection
      ? {
          id: connection.id,
          name: connection.name,
          provider: connection.provider,
          host: connection.host,
          status: connection.status,
        }
      : null,
    headCommit: source.headCommit,
    lastRead:
      source.lastReadAt && source.lastReadCommit
        ? {
            at: source.lastReadAt,
            trigger: failedAttempt ? null : source.lastTrigger,
            commit: source.lastReadCommit,
            commitUrl: commitUrl(connection?.provider ?? null, repository, source.lastReadCommit),
            commitTitle: null,
          }
        : null,
    lastAttemptAt: source.lastAttemptAt,
    lastTrigger: source.lastTrigger,
    lastError: source.lastError,
    nextPollAt: source.mode === 'mirror' && source.state !== 'detached' ? nextPollAt(clockNow(ctx)) : null,
    webhookLastAt: source.webhookLastAt,
    counts: await counts(db, projectRow.id),
    problems: {
      items,
      nextCursor: nextOffset < problems.length ? encodeCursor({ offset: nextOffset }) : null,
      counts: {
        files: new Set(problems.flatMap((problem) => (problem.kind === 'file' ? [problem.path] : []))).size,
        values: problems.filter((problem) => problem.kind === 'value').length,
      },
    },
    mappings: mappingsView(mappings, seen, refs),
    config: summary,
    createdBy: creator,
    createdAt: source.createdAt,
    detachedAt: source.detachedAt,
    detachedBy: source.detachedById ? (refs.get(source.detachedById) ?? null) : null,
    history,
  });
}

/** GET /projects/{project}/backlog (and zamu backlog status): backlog.read. Problems are paged. */
export async function getBacklogStatus(
  ctx: DbContext,
  actor: Actor,
  input: z.input<typeof GetBacklogStatusInput>,
): Promise<BacklogSourceStatus> {
  const parsed = parseInput(GetBacklogStatusInput, input);
  const { project, source } = await sourceForProject(ctx.db, actor, parsed.project, 'backlog.read');
  return backlogStatus(ctx, project, source, { cursor: parsed.problemsCursor, limit: parsed.problemsLimit });
}

/** The settings page and the setup's read step: the same status by projectKey, first problem page. */
export async function getBacklogSettingsStatus(
  ctx: DbContext,
  actor: Actor,
  input: z.input<typeof BacklogProjectInput>,
): Promise<BacklogSourceStatus> {
  const parsed = parseInput(BacklogProjectInput, input);
  return getBacklogStatus(ctx, actor, { project: parsed.projectKey });
}
