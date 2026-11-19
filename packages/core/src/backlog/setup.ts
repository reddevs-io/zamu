// Setup of a Backlog.md source: detection (step 2), preview (step 4, a dry run of the refresh
// planner on the current head), start (step 5: the source row, milestones on, the first refresh
// enqueued in the same transaction) and "New project from Backlog.md". Nothing is written before
// start. Rules: M3 plan, section 5 "Setup, import and detach".
import { randomBytes } from 'node:crypto';
import {
  type BacklogAccess,
  BacklogDetection,
  type BacklogMappings,
  BacklogPreview,
  type BacklogSourceStatus,
  CreateProjectFromBacklogInput,
  DetectBacklogInput,
  DetectBacklogRepositoryInput,
  PROJECT_KEY_PATTERN,
  PreviewBacklogInput,
  type Project,
  StartBacklogInput,
} from '@zamu/contracts';
import { type DbOrTx, schema } from '@zamu/db';
import {
  GitHostRefused,
  GitNotFound,
  type GitProvider,
  GitRateLimited,
  GitUnauthorized,
  GitUnreachable,
  hostnameOf,
} from '@zamu/git-providers';
import { and, eq, inArray } from 'drizzle-orm';
import type { z } from 'zod';
import { type Actor, authorize, can } from '../authz';
import type { DbContext, GitContext, LinkContext } from '../context';
import { clockNow } from '../cycles';
import { Conflict, Forbidden, Invalid, ProjectNotEmpty, parseInput } from '../errors';
import { type GitConnectionRow, providerForConnection } from '../git-connections';
import { findProjectByKey, loadBacklogSource, type ProjectRow, userRef } from '../internal';
import type { JobQueue } from '../jobs';
import { createProject } from '../projects';
import { encryptSecret } from '../secrets';
import { type MemberCandidate, mappingsView, prefillMappings } from './mappings';
import { type BacklogPlan, planRefresh } from './plan';
import {
  type FolderRead,
  folderCounts,
  locateFolder,
  type RepositoryRef,
  readFolder,
  repositoryRef,
} from './reader';
import { enqueueBacklogRefresh } from './refresh';
import { backlogStatus } from './status';

const { backlogSource, member, project, task, user } = schema;

export interface BacklogSetupContext extends DbContext, GitContext {
  jobs?: JobQueue;
}

/** The workspace's members as assignee matching sees them. */
export async function memberCandidates(db: DbOrTx, workspaceId: string): Promise<MemberCandidate[]> {
  return db
    .select({ id: user.id, name: user.name, kind: user.kind, email: user.email })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.organizationId, workspaceId));
}

async function assertEmpty(db: DbOrTx, projectRow: ProjectRow): Promise<void> {
  const [row] = await db.select({ id: task.id }).from(task).where(eq(task.projectId, projectRow.id)).limit(1);
  if (row) {
    throw new ProjectNotEmpty(
      `${projectRow.key} already has tasks. Backlog.md can be set up only on a project without tasks; create a new project from Backlog.md instead.`,
    );
  }
  const source = await loadBacklogSource(db, projectRow.id);
  if (source) throw new Conflict(`${projectRow.key} already has a Backlog.md source`);
}

function requireRepository(projectRow: ProjectRow): RepositoryRef {
  const repository = repositoryRef(projectRow.repository);
  if (!repository) {
    const message = `Link a repository to ${projectRow.key} first`;
    throw new Invalid(message, { issues: [{ path: 'projectKey', message }] });
  }
  return repository;
}

/** The connection's adapter, checked against the workspace and the repository's host. */
async function connectionFor(
  ctx: BacklogSetupContext,
  workspaceId: string,
  connectionId: string,
  repository: RepositoryRef,
): Promise<{ provider: GitProvider; connection: GitConnectionRow }> {
  const opened = await providerForConnection(ctx, connectionId, { workspaceId });
  if (hostnameOf(opened.connection.host) !== repository.host) {
    const message = `${opened.connection.name} reads ${opened.connection.host}, but the repository is on ${repository.host}`;
    throw new Invalid(message, { issues: [{ path: 'connectionId', message }] });
  }
  return opened;
}

/** What a connection read from a repository: access, the default branch head and the folder. */
interface RepositoryRead {
  repository: RepositoryRef;
  access: BacklogAccess;
  defaultBranch: string | null;
  head: string | null;
  location: Awaited<ReturnType<typeof locateFolder>> | null;
  read: FolderRead | null;
}

interface SetupRead extends RepositoryRead {
  projectRow: ProjectRow;
}

/** The project the plan is for: its key for sample keys and the next task number. */
interface PlanTarget {
  key: string;
  nextTaskNumber: number;
}

const ACCESS_ERRORS: [new (...args: never[]) => Error, BacklogAccess][] = [
  [GitUnauthorized, 'no_access'],
  [GitNotFound, 'not_found'],
  [GitUnreachable, 'unreachable'],
  [GitHostRefused, 'unreachable'],
];

/** Shared by detect and preview: checks, then a full read of the folder at the default branch head. */
async function setupRead(
  ctx: BacklogSetupContext,
  actor: Actor,
  input: { projectKey: string; connectionId: string; folderOverride?: string | undefined },
): Promise<SetupRead> {
  const projectRow = await findProjectByKey(ctx.db, actor, input.projectKey);
  authorize(actor, 'backlog.manage', { type: 'project', projectId: projectRow.id });
  await assertEmpty(ctx.db, projectRow);
  const repository = requireRepository(projectRow);
  const read = await readRepository(ctx, actor.workspaceId, repository, input);
  return { ...read, projectRow };
}

/**
 * Reads the repository through the connection: the default branch head, then the folder. Provider
 * access errors become `access`; nothing is written.
 */
async function readRepository(
  ctx: BacklogSetupContext,
  workspaceId: string,
  repository: RepositoryRef,
  input: { connectionId: string; folderOverride?: string | undefined },
): Promise<RepositoryRead> {
  const { provider } = await connectionFor(ctx, workspaceId, input.connectionId, repository);
  try {
    return await readWith(provider, repository, input.folderOverride ?? null);
  } catch (error) {
    if (error instanceof GitRateLimited) {
      throw new Conflict(
        `${provider.host} asked to slow down. Try again in ${Math.max(1, error.retryAfterSeconds)} seconds.`,
      );
    }
    throw error;
  }
}

async function readWith(
  provider: GitProvider,
  repository: RepositoryRef,
  folderOverride: string | null,
): Promise<RepositoryRead> {
  let defaultBranch: string;
  let head: string;
  try {
    defaultBranch = (await provider.getRepository(repository.path)).defaultBranch;
    head = await provider.getBranchHead(repository.path, defaultBranch);
  } catch (error) {
    const access = ACCESS_ERRORS.find(([type]) => error instanceof type)?.[1];
    if (!access) throw error;
    return { repository, access, defaultBranch: null, head: null, location: null, read: null };
  }
  const location = await locateFolder(provider, repository.path, head, folderOverride);
  const read = location.folder
    ? await readFolder(provider, repository.path, { ...location, folder: location.folder }, null)
    : null;
  return { repository, access: 'ok', defaultBranch, head, location, read };
}

function planFor(
  setup: RepositoryRead,
  target: PlanTarget,
  mappings: BacklogMappings,
  now: Date,
): BacklogPlan | null {
  const { read } = setup;
  if (!read || read.configError || !setup.head) return null;
  return planRefresh({
    projectKey: target.key,
    folder: read.folder,
    commit: setup.head,
    now,
    config: read.config,
    configFile: read.configFile,
    files: read.files,
    mappings,
    memberIds: null,
    existing: {
      tasks: [],
      milestones: [],
      files: [],
      nextTaskNumber: target.nextTaskNumber,
      firstRead: true,
      problems: [],
      labels: [],
    },
  });
}

/**
 * The detection of a read: the config summary, file counts per subfolder, and mappings prefilled by
 * name from every value in the files (assignees matched against the workspace's members).
 */
async function detectionOf(
  ctx: BacklogSetupContext,
  actor: Actor,
  setup: RepositoryRead,
  target: PlanTarget | null,
): Promise<BacklogDetection> {
  const prefix = setup.read && !setup.read.configError ? setup.read.config.taskPrefix : null;
  // Without a project, sample keys use the prefix when it is a valid key; only `seen` is used here.
  const planTarget = target ?? {
    key: prefix && PROJECT_KEY_PATTERN.test(prefix) ? prefix : 'KEY',
    nextTaskNumber: 1,
  };
  const plan = planFor(setup, planTarget, { status: [], priority: [], assignee: [] }, clockNow(ctx));
  const members = await memberCandidates(ctx.db, actor.workspaceId);
  const users = new Map(members.map((row) => [row.id, userRef(row)]));
  const empty = { status: [], priority: [], assignee: [] };
  const mappings = plan ? prefillMappings(plan.seen, members) : empty;
  const config = setup.read && !setup.read.configError ? (plan?.config ?? null) : null;
  return BacklogDetection.parse({
    repository: setup.repository.short,
    access: setup.access,
    defaultBranch: setup.defaultBranch,
    headCommit: setup.head,
    headCommittedAt: null,
    folder: setup.location?.folder ?? null,
    folderSource: setup.location?.folder ? setup.location.source : null,
    config,
    configError: setup.read?.configError ?? null,
    folders: setup.location?.folder
      ? folderCounts(setup.location.folder, setup.location.tree, setup.read?.config.taskPrefix)
      : [],
    keyMatchesPrefix: config && target ? config.taskPrefix === target.key : false,
    mappings: plan ? mappingsView(mappings, plan.seen, users) : empty,
  });
}

/**
 * Setup step 2: what the connection sees: access, default branch and head, the folder and how it
 * was found, the config summary, file counts per subfolder, and mappings prefilled by name from
 * every value in the files. Nothing is written.
 */
export async function detectBacklog(
  ctx: BacklogSetupContext,
  actor: Actor,
  input: z.input<typeof DetectBacklogInput>,
): Promise<BacklogDetection> {
  const parsed = parseInput(DetectBacklogInput, input);
  const setup = await setupRead(ctx, actor, parsed);
  return detectionOf(ctx, actor, setup, setup.projectRow);
}

/** Creating a project from Backlog.md: project.create plus connection.manage (owners and admins). */
function authorizeNewFromBacklog(actor: Actor): void {
  authorize(actor, 'project.create');
  // backlog.manage needs a project id; the same people manage connections.
  if (!can(actor, 'connection.manage')) {
    throw new Forbidden('Only workspace admins can set up Backlog.md');
  }
}

function repositoryInput(value: string): RepositoryRef {
  const repository = repositoryRef(value);
  if (!repository) {
    throw new Invalid('Not a repository URL', {
      issues: [{ path: 'repository', message: 'Not a repository URL' }],
    });
  }
  return repository;
}

/**
 * "New project from Backlog.md" before the project exists: the same read as setup step 2 on a
 * repository URL, so the dialog can prefill the name (project_name) and key (the prefix). The key
 * matches nothing yet, so keyMatchesPrefix is false. Nothing is written. Owners and admins only.
 */
export async function detectBacklogRepository(
  ctx: BacklogSetupContext,
  actor: Actor,
  input: z.input<typeof DetectBacklogRepositoryInput>,
): Promise<BacklogDetection> {
  const parsed = parseInput(DetectBacklogRepositoryInput, input);
  authorizeNewFromBacklog(actor);
  const repository = repositoryInput(parsed.repository);
  const setup = await readRepository(ctx, actor.workspaceId, repository, parsed);
  return detectionOf(ctx, actor, setup, null);
}

/** Setup step 4: the refresh planner on the current head with the given mappings. Nothing is written. */
export async function previewBacklog(
  ctx: BacklogSetupContext,
  actor: Actor,
  input: z.input<typeof PreviewBacklogInput>,
): Promise<BacklogPreview> {
  const parsed = parseInput(PreviewBacklogInput, input);
  const setup = await setupRead(ctx, actor, parsed);
  if (setup.access !== 'ok') {
    throw new Invalid(
      `The connection cannot read ${setup.repository.short} (${setup.access.replace('_', ' ')})`,
    );
  }
  if (!setup.read) throw new Invalid(`No Backlog.md folder in ${setup.repository.short}`);
  if (setup.read.configError)
    throw new Invalid(`The Backlog.md config could not be read: ${setup.read.configError}`);
  const plan = planFor(setup, setup.projectRow, parsed.mappings, clockNow(ctx)) as BacklogPlan;
  return BacklogPreview.parse({
    commit: plan.commit,
    defaultBranch: setup.defaultBranch,
    counts: plan.counts,
    sample: plan.sample,
    files: plan.problems.filter((problem) => problem.kind === 'file'),
    fallbacks: plan.problems.filter((problem) => problem.kind === 'value'),
  });
}

/** A random, URL-safe id for the webhook URL and a secret for its signature. */
export function newWebhookCredentials(): { webhookId: string; secret: string } {
  return { webhookId: randomBytes(18).toString('base64url'), secret: randomBytes(32).toString('base64url') };
}

/** Mapped users must be members of the workspace. Invalid otherwise. */
export async function assertMappedMembers(
  db: DbOrTx,
  workspaceId: string,
  mappings: BacklogMappings,
): Promise<void> {
  const ids = [...new Set(mappings.assignee.flatMap((row) => (row.userId ? [row.userId] : [])))];
  if (ids.length === 0) return;
  const rows = await db
    .select({ userId: member.userId })
    .from(member)
    .where(and(eq(member.organizationId, workspaceId), inArray(member.userId, ids)));
  const found = new Set(rows.map((row) => row.userId));
  const index = mappings.assignee.findIndex((row) => row.userId && !found.has(row.userId));
  if (index >= 0) {
    const message = 'Map assignees to members of this workspace';
    throw new Invalid(message, { issues: [{ path: `mappings.assignee.${index}.userId`, message }] });
  }
}

/**
 * Setup step 5: creates the source (mode, connection, folder, mappings, webhook id and secret),
 * turns milestones on and enqueues the first refresh, all in one transaction. Import mode detaches
 * right after that first read succeeds.
 */
export async function startBacklog(
  ctx: BacklogSetupContext & Partial<LinkContext>,
  actor: Actor,
  input: z.input<typeof StartBacklogInput>,
): Promise<BacklogSourceStatus> {
  const parsed = parseInput(StartBacklogInput, input);
  const { webhookId, secret } = newWebhookCredentials();
  const secretCiphertext = encryptSecret(ctx, secret);
  const { projectRow, source } = await ctx.db.transaction(async (tx) => {
    const projectRow = await findProjectByKey(tx, actor, parsed.projectKey, { forUpdate: true });
    authorize(actor, 'backlog.manage', { type: 'project', projectId: projectRow.id });
    await assertEmpty(tx, projectRow);
    const repository = requireRepository(projectRow);
    await connectionFor(ctx, actor.workspaceId, parsed.connectionId, repository);
    await assertMappedMembers(tx, actor.workspaceId, parsed.mappings);
    const [source] = await tx
      .insert(backlogSource)
      .values({
        projectId: projectRow.id,
        connectionId: parsed.connectionId,
        mode: parsed.mode,
        state: 'setup',
        folderOverride: parsed.folderOverride ?? null,
        mappings: parsed.mappings,
        webhookId,
        webhookSecretCiphertext: secretCiphertext,
        createdById: actor.userId,
      })
      .returning();
    if (!source) throw new Error('backlog source insert returned no row');
    if (!projectRow.usesMilestones) {
      await tx.update(project).set({ usesMilestones: true }).where(eq(project.id, projectRow.id));
    }
    await enqueueBacklogRefresh(ctx, tx, source.id, 'setup');
    return { projectRow, source };
  });
  return backlogStatus(ctx, projectRow, source, { limit: 50 });
}

/**
 * "New project from Backlog.md": creates the project (key from the prefix when it is a valid key,
 * repository from the input) after checking the connection reads the repository's host. The setup
 * continues at the mappings step with detection on the new project. Owners and admins only.
 */
export async function createProjectFromBacklog(
  ctx: BacklogSetupContext,
  actor: Actor,
  input: z.input<typeof CreateProjectFromBacklogInput>,
): Promise<Project> {
  const parsed = parseInput(CreateProjectFromBacklogInput, input);
  authorizeNewFromBacklog(actor);
  const repository = repositoryInput(parsed.repository);
  await connectionFor(ctx, actor.workspaceId, parsed.connectionId, repository);
  return createProject(ctx, actor, { name: parsed.name, key: parsed.key, repository: parsed.repository });
}
