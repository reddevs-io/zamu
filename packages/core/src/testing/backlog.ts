// M3 test fixtures: git connections, Backlog.md sources and a mirrored project, written with raw
// inserts that skip the services' rules (the mirror engine writes these rows itself). Test-only.
import type { BacklogBlock, BacklogProblem } from '@zamu/contracts';
import { type Db, schema } from '@zamu/db';
import { eq, sql } from 'drizzle-orm';
import { createMilestoneRow, type ProjectScope, randomProjectKey, scopeOf, type World } from './fixtures';

export type GitConnectionRow = typeof schema.gitConnection.$inferSelect;
export type BacklogSourceRow = typeof schema.backlogSource.$inferSelect;
export type BacklogFileRow = typeof schema.backlogFile.$inferSelect;
export type ProjectRow = typeof schema.project.$inferSelect;
export type TaskRow = typeof schema.task.$inferSelect;
export type MilestoneRow = typeof schema.milestone.$inferSelect;

const unique = () => crypto.randomUUID().slice(0, 8);

/** Inserts a git connection with a fake token (never decrypted by these fixtures). */
export async function createGitConnectionRow(
  db: Db,
  world: Pick<World, 'workspaceId' | 'owner'>,
  values: Partial<Omit<typeof schema.gitConnection.$inferInsert, 'workspaceId'>> = {},
): Promise<GitConnectionRow> {
  const [row] = await db
    .insert(schema.gitConnection)
    .values({
      name: `GitLab · ${unique()}`,
      provider: 'gitlab',
      host: 'gitlab.com',
      apiBaseUrl: 'https://gitlab.com/api/v4',
      tokenCiphertext: 'v1:fake-token-ciphertext',
      tokenHint: 'abc',
      status: 'working',
      createdById: world.owner.id,
      ...values,
      workspaceId: world.workspaceId,
    })
    .returning();
  if (!row) throw new Error('git connection insert failed');
  return row;
}

/**
 * Inserts a Backlog.md source for a project. Defaults: mirror mode, healthy, folder backlog,
 * branch main, prefix BACK, read at commit a1b2c3d. state detached sets detachedAt (the check
 * constraint requires it).
 */
export async function createBacklogSourceRow(
  db: Db,
  projectId: string,
  values: Partial<Omit<typeof schema.backlogSource.$inferInsert, 'projectId'>> & { createdById: string },
): Promise<BacklogSourceRow> {
  const state = values.state ?? 'healthy';
  const [row] = await db
    .insert(schema.backlogSource)
    .values({
      mode: 'mirror',
      folder: 'backlog',
      defaultBranch: 'main',
      prefix: 'BACK',
      headCommit: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0',
      lastReadCommit: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0',
      lastReadAt: new Date(),
      lastAttemptAt: new Date(),
      lastTrigger: 'webhook',
      webhookId: `wh_${crypto.randomUUID().replaceAll('-', '')}`,
      webhookSecretCiphertext: 'v1:fake-secret-ciphertext',
      ...values,
      state,
      detachedAt: values.detachedAt ?? (state === 'detached' ? new Date() : null),
      detachedById: values.detachedById ?? (state === 'detached' ? values.createdById : null),
      projectId,
    })
    .returning();
  if (!row) throw new Error('backlog source insert failed');
  return row;
}

/** Inserts a backlog_file row (the file a task or milestone was read from, or a skipped one). */
export async function createBacklogFileRow(
  db: Db,
  sourceId: string,
  values: Partial<Omit<typeof schema.backlogFile.$inferInsert, 'sourceId'>> & { path: string },
): Promise<BacklogFileRow> {
  const [row] = await db
    .insert(schema.backlogFile)
    .values({ blobSha: crypto.randomUUID().replaceAll('-', ''), kind: 'task', ...values, sourceId })
    .returning();
  if (!row) throw new Error('backlog file insert failed');
  return row;
}

/** The fields of a Backlog.md block as stored (updatedDate as an ISO string). */
export type BacklogBlockValues = Omit<BacklogBlock, 'updatedDate'> & { updatedDate: string | null };

/** A Backlog.md block (task.backlog_data) with the given fields; the rest take the contract defaults. */
export function backlogBlock(values: Partial<BacklogBlockValues> = {}): Record<string, unknown> {
  return {
    kind: 'task',
    status: null,
    priority: null,
    milestone: null,
    assignees: [],
    reporter: null,
    labels: [],
    dependencies: [],
    parentId: null,
    subtasks: [],
    dueDate: null,
    type: null,
    references: [],
    documentation: [],
    modifiedFiles: [],
    createdDate: null,
    updatedDate: null,
    ordinal: null,
    other: {},
    ...values,
  };
}

export interface MirroredTaskValues extends Partial<Omit<typeof schema.task.$inferInsert, 'projectId'>> {
  number: number;
  backlogId: string;
  createdById: string;
  /** The file path to record in backlog_file (kind from the block); null records none (hidden tasks). */
  file?: string | null;
  sourceId?: string;
}

/**
 * Inserts a mirrored task like the refresh would: number and suffix from the Backlog.md id, the
 * block in backlog_data, and its backlog_file row when `file` and `sourceId` are given. Raises
 * project.next_task_number past the number. Rank defaults to the number.
 */
export async function createMirroredTaskRow(
  db: Db,
  scope: ProjectScope,
  { file, sourceId, ...values }: MirroredTaskValues,
): Promise<TaskRow> {
  const [row] = await db
    .insert(schema.task)
    .values({
      title: `Mirrored ${values.backlogId}`,
      rank: values.number,
      backlogData: backlogBlock(),
      ...values,
      projectId: scope.projectId,
    })
    .returning();
  if (!row) throw new Error('mirrored task insert failed');
  await db
    .update(schema.project)
    .set({
      nextTaskNumber: sql`greatest(${schema.project.nextTaskNumber}, ${values.number + 1})`,
      updatedAt: sql`${schema.project.updatedAt}`,
    })
    .where(eq(schema.project.id, scope.projectId));
  if (file && sourceId) {
    const kind = (row.backlogData as { kind?: string } | null)?.kind;
    await createBacklogFileRow(db, sourceId, {
      path: file,
      kind: kind === 'draft' || kind === 'archived' ? kind : 'task',
      backlogId: values.backlogId,
      taskId: row.id,
    });
  }
  return row;
}

export interface MirroredProjectOptions {
  /** Project key; default random. */
  key?: string;
  name?: string;
  mode?: 'mirror' | 'import';
  state?: BacklogSourceRow['state'];
  /** Default a unique gitlab.com repository. */
  repository?: string;
}

/**
 * A project mirrored from Backlog.md (prefix BACK, folder backlog, branch main) with:
 * - parent: BACK-786 → KEY-786, In progress, assigned to the owner through the @ana mapping,
 *   milestone m-1, labels, a dependency on BACK-12 and one on a missing BACK-999, subtask BACK-786.1;
 * - subtask: BACK-786.1 → KEY-786.1 (parent BACK-786, subtask BACK-786.1.2);
 * - nested: BACK-786.1.2 → KEY-786.1.2;
 * - draft: DRAFT-3 → KEY-787 (Backlog), read with `backlog draft edit`;
 * - hidden: BACK-12 → KEY-12, Done, its file gone (hidden_at set, no backlog_file row);
 * - milestone m-1 "Webhooks v2" with its file;
 * - a skipped file (back-233, invalid YAML) and a status value that fell back (Blocked → Todo).
 * next_task_number is 788.
 */
export interface MirroredProject {
  project: ProjectRow;
  scope: ProjectScope;
  key: string;
  connection: GitConnectionRow;
  source: BacklogSourceRow;
  milestone: MilestoneRow;
  tasks: { parent: TaskRow; subtask: TaskRow; nested: TaskRow; draft: TaskRow; hidden: TaskRow };
  /** Repository paths of the files, by fixture name. */
  files: {
    parent: string;
    subtask: string;
    nested: string;
    draft: string;
    milestone: string;
    skipped: string;
  };
}

export const MIRROR_STATUS_MAPPINGS = [
  { from: 'To Do', to: 'todo', how: 'name' },
  { from: 'In Progress', to: 'in_progress', how: 'name' },
  { from: 'Done', to: 'done', how: 'name' },
  { from: 'Blocked', to: 'todo', how: 'fallback' },
];
export const MIRROR_PRIORITY_MAPPINGS = [
  { from: 'high', to: 'high', how: 'name' },
  { from: 'medium', to: 'medium', how: 'name' },
  { from: 'low', to: 'low', how: 'name' },
];

export async function createMirroredProject(
  db: Db,
  world: World,
  options: MirroredProjectOptions = {},
): Promise<MirroredProject> {
  const key = options.key ?? randomProjectKey();
  const repository = options.repository ?? `https://gitlab.com/reddevs/payments-${unique()}`;
  const repositoryKey = repository
    .replace(/^https?:\/\//, '')
    .replace(/\.git$/, '')
    .toLowerCase();
  const [project] = await db
    .insert(schema.project)
    .values({
      workspaceId: world.workspaceId,
      key,
      name: options.name ?? 'Payments API',
      usesMilestones: true,
      usesCycles: true,
      repository,
      repositoryKey,
    })
    .returning();
  if (!project) throw new Error('project insert failed');
  const scope = scopeOf(project);
  const createdById = world.owner.id;

  const connection = await createGitConnectionRow(db, world);
  const warnings: BacklogProblem[] = [
    {
      kind: 'value',
      field: 'status',
      value: 'Blocked',
      count: 1,
      fallback: 'Todo',
      message: 'Status "Blocked" has no mapping; its tasks are Todo',
    },
  ];
  const source = await createBacklogSourceRow(db, project.id, {
    createdById,
    connectionId: connection.id,
    mode: options.mode ?? 'mirror',
    state: options.state ?? 'warnings',
    mappings: {
      status: MIRROR_STATUS_MAPPINGS,
      priority: MIRROR_PRIORITY_MAPPINGS,
      assignee: [
        { from: '@ana', userId: world.owner.id, how: 'name' },
        { from: '@claude', userId: world.agent.id, how: 'manual' },
      ],
    },
    warnings: warnings as unknown as Record<string, unknown>[],
  });

  const files = {
    parent: 'backlog/tasks/back-786 - Retry-failed-webhook-deliveries.md',
    subtask: 'backlog/tasks/back-786.1 - Exponential-backoff.md',
    nested: 'backlog/tasks/back-786.1.2 - Jitter.md',
    draft: 'backlog/drafts/draft-3 - Pause-an-endpoint.md',
    milestone: 'backlog/milestones/m-1 - webhooks-v2.md',
    skipped: 'backlog/tasks/back-233 - Retry-SEPA-mandates.md',
  };

  const milestone = await createMilestoneRow(db, scope, {
    name: 'Webhooks v2',
    status: 'active',
    backlogId: 'm-1',
    createdById,
  });
  await createBacklogFileRow(db, source.id, {
    path: files.milestone,
    kind: 'milestone',
    backlogId: 'm-1',
    milestoneId: milestone.id,
  });

  const hidden = await createMirroredTaskRow(db, scope, {
    number: 12,
    backlogId: 'BACK-12',
    title: 'Split the ledger writer from the API process',
    status: 'done',
    createdById,
    hiddenAt: new Date(),
    backlogData: backlogBlock({ kind: 'archived', status: 'Done' }),
    file: null,
  });
  const parent = await createMirroredTaskRow(db, scope, {
    number: 786,
    backlogId: 'BACK-786',
    title: 'Retry failed webhook deliveries with exponential backoff',
    description: 'Retry deliveries that fail with 5xx.',
    status: 'in_progress',
    priority: 3,
    assigneeId: world.owner.id,
    milestoneId: milestone.id,
    createdById,
    backlogData: backlogBlock({
      status: 'In Progress',
      priority: 'high',
      milestone: 'm-1',
      assignees: [
        { value: '@ana', userId: world.owner.id },
        { value: '@ghost', userId: null },
      ],
      labels: ['webhooks', 'reliability'],
      dependencies: ['BACK-12', 'BACK-999'],
      subtasks: ['BACK-786.1'],
      createdDate: '2026-10-21 14:26',
    }),
    file: files.parent,
    sourceId: source.id,
  });
  const subtask = await createMirroredTaskRow(db, scope, {
    number: 786,
    keySuffix: '1',
    backlogId: 'BACK-786.1',
    title: 'Exponential backoff schedule',
    status: 'todo',
    createdById,
    backlogData: backlogBlock({ status: 'To Do', parentId: 'BACK-786', subtasks: ['BACK-786.1.2'] }),
    file: files.subtask,
    sourceId: source.id,
  });
  const nested = await createMirroredTaskRow(db, scope, {
    number: 786,
    keySuffix: '1.2',
    backlogId: 'BACK-786.1.2',
    title: 'Add jitter',
    status: 'todo',
    createdById,
    backlogData: backlogBlock({ status: 'To Do', parentId: 'BACK-786.1' }),
    file: files.nested,
    sourceId: source.id,
  });
  const draft = await createMirroredTaskRow(db, scope, {
    number: 787,
    backlogId: 'DRAFT-3',
    title: 'Idea: let merchants pause an endpoint',
    status: 'backlog',
    createdById,
    backlogData: backlogBlock({ kind: 'draft', status: 'To Do' }),
    file: files.draft,
    sourceId: source.id,
  });
  await createBacklogFileRow(db, source.id, {
    path: files.skipped,
    backlogId: 'BACK-233',
    error: 'frontmatter is not valid YAML (line 3)',
  });

  const [fresh] = await db.select().from(schema.project).where(eq(schema.project.id, project.id));
  return {
    project: fresh ?? project,
    scope,
    key,
    connection,
    source,
    milestone,
    tasks: { parent, subtask, nested, draft, hidden },
    files,
  };
}
