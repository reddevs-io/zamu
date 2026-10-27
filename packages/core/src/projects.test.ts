import { getActorFromRequest } from '@pm/auth';
import { type Db, schema } from '@pm/db';
import { eq, inArray, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApiKey, listApiKeys, readKeyMetadata } from './api-keys';
import type { Actor } from './authz';
import { refreshBacklogSource } from './backlog/refresh';
import {
  configFile,
  createMirror,
  FakeProvider,
  FakeRepository,
  mirrorContext,
  taskFile,
  taskPath,
} from './backlog/testing';
import { createCycle, endCycle } from './cycles';
import { Conflict, Forbidden, Invalid, NotFound } from './errors';
import { createProject, deleteProject, listProjects, type ProjectLogger, updateProject } from './projects';
import { createTask, updateTask } from './tasks';
import { createMirroredProject } from './testing/backlog';
import {
  createCommentRow,
  createCycleRow,
  createTaskRow,
  createWorld,
  keyActor,
  randomProjectKey,
  type TestContext,
  testContext,
  type World,
} from './testing/fixtures';

describe('projects', () => {
  let ctx: TestContext;
  let world: World;

  beforeAll(async () => {
    ctx = testContext();
    world = await createWorld(ctx.db);
  });
  afterAll(async () => {
    await ctx?.close();
  });

  it('creates a project with an upper-cased key and rejects duplicates', async () => {
    const created = await createProject(ctx, world.memberActor, {
      name: 'Payments',
      key: ' pay ',
      description: 'Card and bank payments',
    });
    expect(created).toMatchObject({ key: 'PAY', name: 'Payments', description: 'Card and bank payments' });
    expect(typeof created.createdAt).toBe('string');

    await expect(createProject(ctx, world.ownerActor, { name: 'Other', key: 'PAY' })).rejects.toThrow(
      Conflict,
    );
    await expect(createProject(ctx, world.ownerActor, { name: 'Bad', key: '1AB' })).rejects.toThrow(Invalid);
  });

  it('lets the same key exist in another workspace', async () => {
    const other = await createWorld(ctx.db, 'Elsewhere');
    await createProject(ctx, world.ownerActor, { name: 'Shared', key: 'SHR' });
    await expect(createProject(ctx, other.ownerActor, { name: 'Shared', key: 'SHR' })).resolves.toMatchObject(
      {
        key: 'SHR',
      },
    );
  });

  it('changes the key only while the project has no tasks', async () => {
    await createProject(ctx, world.ownerActor, { name: 'Docs', key: 'DOC' });
    const renamed = await updateProject(ctx, world.ownerActor, {
      project: 'doc',
      key: 'DOCS',
      name: 'Docs site',
    });
    expect(renamed).toMatchObject({ key: 'DOCS', name: 'Docs site' });

    await createTask(ctx, world.ownerActor, { project: 'DOCS', title: 'First page' });
    await expect(updateProject(ctx, world.ownerActor, { project: 'DOCS', key: 'DOCX' })).rejects.toThrow(
      /already has tasks/,
    );
    // Other fields still change, and a description can be cleared.
    await updateProject(ctx, world.ownerActor, { project: 'DOCS', description: 'Public docs' });
    const cleared = await updateProject(ctx, world.ownerActor, { project: 'DOCS', description: null });
    expect(cleared.description).toBeNull();

    await createProject(ctx, world.ownerActor, { name: 'Web', key: 'WEB' });
    await expect(updateProject(ctx, world.ownerActor, { project: 'WEB', key: 'PAY' })).rejects.toThrow(
      Conflict,
    );
    await expect(updateProject(ctx, world.ownerActor, { project: 'NOPE', name: 'x' })).rejects.toThrow(
      NotFound,
    );
  });

  it('lists projects with open counts, assignees and last activity', async () => {
    const w = await createWorld(ctx.db);
    await createProject(ctx, w.ownerActor, { name: 'Billing', key: 'BIL' });
    const quiet = await createProject(ctx, w.ownerActor, { name: 'Quiet', key: 'QUI' });
    await createTask(ctx, w.ownerActor, { project: 'BIL', title: 'a', status: 'backlog' });
    await createTask(ctx, w.ownerActor, { project: 'BIL', title: 'b', assignee: w.agent.id });
    await createTask(ctx, w.ownerActor, {
      project: 'BIL',
      title: 'c',
      status: 'in_progress',
      assignee: 'me',
    });
    await createTask(ctx, w.ownerActor, {
      project: 'BIL',
      title: 'd',
      status: 'done',
      assignee: w.member.id,
    });
    const review = await createTask(ctx, w.ownerActor, { project: 'BIL', title: 'e' });
    await updateTask(ctx, w.ownerActor, { key: review.key, status: 'in_review' });

    const { items } = await listProjects(ctx, w.memberActor);
    expect(items.map((p) => p.key)).toEqual(['BIL', 'QUI']);
    const [billing, quietRow] = items;
    expect(billing?.openCounts).toEqual({ backlog: 1, todo: 1, in_progress: 1, in_review: 1 });
    expect(billing?.openCount).toBe(4);
    // Done tasks do not count; people come before agents.
    expect(billing?.assignees.map((a) => a.id)).toEqual([w.owner.id, w.agent.id]);
    expect(quietRow).toMatchObject({ openCount: 0, assignees: [], lastActivityAt: quiet.updatedAt });
    expect(Date.parse(billing?.lastActivityAt ?? '')).toBeGreaterThanOrEqual(Date.parse(review.updatedAt));
  });

  it('limits listing and writes to the key scope', async () => {
    const w = await createWorld(ctx.db);
    const pay = await createProject(ctx, w.ownerActor, { name: 'Payments', key: 'PAY' });
    await createProject(ctx, w.ownerActor, { name: 'Web', key: 'WEB' });
    const scoped = { ...w.agentActor, scope: { projects: [pay.id], access: 'write' as const } };

    const { items } = await listProjects(ctx, scoped);
    expect(items.map((p) => p.key)).toEqual(['PAY']);
    await expect(createProject(ctx, scoped, { name: 'New', key: 'NEW' })).rejects.toThrow(Forbidden);
    await expect(updateProject(ctx, scoped, { project: 'WEB', name: 'x' })).rejects.toThrow(Forbidden);

    const readOnly = { ...w.agentActor, scope: { projects: 'all' as const, access: 'read' as const } };
    expect((await listProjects(ctx, readOnly)).items).toHaveLength(2);
    await expect(updateProject(ctx, readOnly, { project: 'PAY', name: 'x' })).rejects.toThrow(Forbidden);
  });

  it('links one repository per project, matched on host and path', async () => {
    const w = await createWorld(ctx.db);
    const pay = await createProject(ctx, w.ownerActor, {
      name: 'Payments',
      key: 'PAY',
      repository: 'git@gitlab.com:reddevs/payments.git',
    });
    expect(pay.repository).toBe('git@gitlab.com:reddevs/payments.git');
    const plain = await createProject(ctx, w.ownerActor, { name: 'Web', key: 'WEB', repository: '' });
    expect(plain.repository).toBeNull();

    // The same repository in another form is taken, and the message names the owner.
    const taken = createProject(ctx, w.ownerActor, {
      name: 'Copy',
      key: 'CPY',
      repository: 'https://GitLab.com/reddevs/payments',
    });
    await expect(taken).rejects.toThrow(Conflict);
    await expect(taken).rejects.toMatchObject({
      message:
        'Payments (PAY) already uses gitlab.com/reddevs/payments. A repository can belong to one project.',
      issues: [{ path: 'repository' }],
    });
    await expect(
      updateProject(ctx, w.ownerActor, {
        project: 'WEB',
        repository: 'ssh://git@gitlab.com:22/reddevs/payments',
      }),
    ).rejects.toThrow(/Payments \(PAY\) already uses/);

    // Its own project can switch to another form of the same URL, or to another repository.
    const ssh = await updateProject(ctx, w.ownerActor, {
      project: 'PAY',
      repository: 'https://gitlab.com/reddevs/payments.git',
    });
    expect(ssh.repository).toBe('https://gitlab.com/reddevs/payments.git');
    const listed = (await listProjects(ctx, w.ownerActor)).items.find((p) => p.key === 'PAY');
    expect(listed?.repository).toBe('https://gitlab.com/reddevs/payments.git');

    // Clearing frees the repository for another project.
    const cleared = await updateProject(ctx, w.ownerActor, { project: 'PAY', repository: null });
    expect(cleared.repository).toBeNull();
    const web = await updateProject(ctx, w.ownerActor, {
      project: 'WEB',
      repository: 'git@gitlab.com:reddevs/payments.git',
    });
    expect(web.repository).toBe('git@gitlab.com:reddevs/payments.git');

    await expect(
      updateProject(ctx, w.ownerActor, { project: 'PAY', repository: 'reddevs/payments' }),
    ).rejects.toThrow(Invalid);

    // Another workspace can link the same repository.
    const other = await createWorld(ctx.db, 'Elsewhere');
    await expect(
      createProject(ctx, other.ownerActor, {
        name: 'Web',
        key: 'WEB',
        repository: 'git@gitlab.com:reddevs/payments.git',
      }),
    ).resolves.toMatchObject({ key: 'WEB' });
  });

  it('does not name a project outside the key scope in a repository conflict', async () => {
    const w = await createWorld(ctx.db);
    await createProject(ctx, w.ownerActor, {
      name: 'Secret',
      key: 'SEC',
      repository: 'https://github.com/t/secret',
    });
    const mine = await createProject(ctx, w.ownerActor, { name: 'Mine', key: 'MIN' });
    const scoped = { ...w.agentActor, scope: { projects: [mine.id], access: 'write' as const } };
    await expect(
      updateProject(ctx, scoped, { project: 'MIN', repository: 'git@github.com:t/secret.git' }),
    ).rejects.toThrow(
      'Another project in this workspace already uses github.com/t/secret. A repository can belong to one project.',
    );
    // A project-scoped write key may link its own project.
    await expect(
      updateProject(ctx, scoped, { project: 'MIN', repository: 'git@github.com:t/mine.git' }),
    ).resolves.toMatchObject({ repository: 'git@github.com:t/mine.git' });
  });

  it('turns milestones and cycles on and off, both on by default', async () => {
    const created = await createProject(ctx, world.ownerActor, { name: 'Flags', key: randomProjectKey() });
    expect(created).toMatchObject({ usesMilestones: true, usesCycles: true, currentCycle: null });

    const off = await updateProject(ctx, world.memberActor, {
      project: created.key,
      usesMilestones: false,
      usesCycles: false,
    });
    expect(off).toMatchObject({ usesMilestones: false, usesCycles: false });
    // Unchanged values are a no-op, not an error.
    expect(
      await updateProject(ctx, world.memberActor, { project: created.key, usesCycles: false }),
    ).toMatchObject({
      usesCycles: false,
      updatedAt: off.updatedAt,
    });
    const on = await updateProject(ctx, world.memberActor, { project: created.key, usesCycles: true });
    expect(on).toMatchObject({ usesMilestones: false, usesCycles: true });

    const readOnly = { ...world.agentActor, scope: { projects: 'all' as const, access: 'read' as const } };
    await expect(
      updateProject(ctx, readOnly, { project: created.key, usesMilestones: true }),
    ).rejects.toThrow(Forbidden);
  });

  it('shows the current cycle in the project list and after updates', async () => {
    const w = await createWorld(ctx.db);
    const now = new Date('2040-05-09T08:00:00Z');
    const clock = { ...ctx, timeZone: 'UTC', now: () => now };
    const pay = await createProject(clock, w.ownerActor, { name: 'Payments', key: 'PAY' });
    await createProject(clock, w.ownerActor, { name: 'Web', key: 'WEB' });
    const cycle = await createCycle(clock, w.ownerActor, {
      project: 'PAY',
      name: 'Checkout',
      startsOn: '2040-05-01',
      endsOn: '2040-05-11',
    });
    await createCycle(clock, w.ownerActor, { project: 'WEB', startsOn: '2040-05-20', endsOn: '2040-05-30' });

    const byKey = async () =>
      Object.fromEntries((await listProjects(clock, w.ownerActor)).items.map((p) => [p.key, p.currentCycle]));
    expect(await byKey()).toEqual({
      PAY: {
        id: cycle.id,
        number: 1,
        name: 'Checkout',
        startsOn: '2040-05-01',
        endsOn: '2040-05-11',
        daysLeft: 3,
      },
      WEB: null,
    });
    expect(
      (await updateProject(clock, w.ownerActor, { project: 'PAY', name: 'Pay' })).currentCycle,
    ).toMatchObject({
      number: 1,
    });

    // Turning cycles off hides the current cycle; ending it removes it.
    expect(
      (await updateProject(clock, w.ownerActor, { project: 'PAY', usesCycles: false })).currentCycle,
    ).toBeNull();
    expect((await byKey()).PAY).toBeNull();
    await updateProject(clock, w.ownerActor, { project: 'PAY', usesCycles: true });
    await endCycle(clock, w.ownerActor, { project: pay.key, number: 'current' });
    expect((await byKey()).PAY).toBeNull();
  });
});

/** Captures deleteProject's audit lines. */
function captureLogger(): ProjectLogger & { lines: { msg: string; fields: Record<string, unknown> }[] } {
  const lines: { msg: string; fields: Record<string, unknown> }[] = [];
  return { lines, info: (msg, fields) => lines.push({ msg, fields }) };
}

/** Rows left in each child table of a project, by the ids the project had before deletion. */
async function childCounts(
  db: Db,
  ids: {
    projectId: string;
    taskIds: string[];
    cycleIds: string[];
    commentIds: string[];
    sourceIds: string[];
  },
) {
  const count = async (query: Promise<{ n: number }[]>) => (await query)[0]?.n ?? 0;
  const n = sql<number>`count(*)`.mapWith(Number);
  const none = ['00000000-0000-0000-0000-000000000000'];
  const or = (list: string[]) => (list.length ? list : none);
  return {
    project: await count(db.select({ n }).from(schema.project).where(eq(schema.project.id, ids.projectId))),
    milestone: await count(
      db.select({ n }).from(schema.milestone).where(eq(schema.milestone.projectId, ids.projectId)),
    ),
    cycle: await count(db.select({ n }).from(schema.cycle).where(eq(schema.cycle.projectId, ids.projectId))),
    task: await count(db.select({ n }).from(schema.task).where(eq(schema.task.projectId, ids.projectId))),
    activity: await count(
      db.select({ n }).from(schema.activity).where(eq(schema.activity.projectId, ids.projectId)),
    ),
    cycleRollover: await count(
      db
        .select({ n })
        .from(schema.cycleRollover)
        .where(inArray(schema.cycleRollover.cycleId, or(ids.cycleIds))),
    ),
    comment: await count(
      db.select({ n }).from(schema.comment).where(eq(schema.comment.projectId, ids.projectId)),
    ),
    commentMention: await count(
      db
        .select({ n })
        .from(schema.commentMention)
        .where(inArray(schema.commentMention.commentId, or(ids.commentIds))),
    ),
    backlogSource: await count(
      db.select({ n }).from(schema.backlogSource).where(eq(schema.backlogSource.projectId, ids.projectId)),
    ),
    backlogFile: await count(
      db
        .select({ n })
        .from(schema.backlogFile)
        .where(inArray(schema.backlogFile.sourceId, or(ids.sourceIds))),
    ),
  };
}

/** A small Backlog.md repository: config and two tasks. */
function smallRepo(): FakeRepository {
  return new FakeRepository(`reddevs/delete-${crypto.randomUUID().slice(0, 8)}`, {
    'backlog/config.yml': configFile({ statuses: ['To Do', 'In Progress', 'Done'] }),
    [taskPath('backlog', 'back-1', 'First')]: taskFile({ id: 'BACK-1', title: 'First' }),
    [taskPath('backlog', 'back-2', 'Second')]: taskFile({ id: 'BACK-2', title: 'Second' }),
  });
}

/** Deletes `projectKey` with `actor` the first time the refresh asks for the branch head. */
class DeletingProvider extends FakeProvider {
  onHead: (() => Promise<void>) | null = null;
  override async getBranchHead(path: string, branch: string) {
    const hook = this.onHead;
    this.onHead = null;
    if (hook) await hook();
    return super.getBranchHead(path, branch);
  }
}

describe('deleteProject', () => {
  let ctx: TestContext;
  let world: World;
  let adminActor: Actor;

  beforeAll(async () => {
    ctx = testContext();
    world = await createWorld(ctx.db);
    const admin = await createWorld(ctx.db); // any user id works; role decides
    adminActor = { ...world.ownerActor, userId: admin.owner.id, role: 'admin' };
    await ctx.db
      .insert(schema.member)
      .values({ organizationId: world.workspaceId, userId: admin.owner.id, role: 'admin' });
  });
  afterAll(async () => {
    await ctx?.close();
  });

  async function newProject(key = randomProjectKey()) {
    return createProject(ctx, world.ownerActor, { name: `Delete ${key}`, key });
  }

  it('lets the owner and an admin delete a project after confirming its key', async () => {
    const logger = captureLogger();
    const a = await newProject();
    await expect(
      deleteProject({ ...ctx, logger }, world.ownerActor, {
        project: a.key.toLowerCase(),
        confirmKey: ` ${a.key.toLowerCase()} `,
      }),
    ).resolves.toBeUndefined();
    const b = await newProject();
    await deleteProject({ ...ctx, logger }, adminActor, { project: b.key, confirmKey: b.key });
    const keys = (await listProjects(ctx, world.ownerActor)).items.map((p) => p.key);
    expect(keys).not.toContain(a.key);
    expect(keys).not.toContain(b.key);
    await expect(deleteProject(ctx, world.ownerActor, { project: a.key, confirmKey: a.key })).rejects.toThrow(
      NotFound,
    );
  });

  it('refuses members, agents and keys that are not workspace-wide writers', async () => {
    const p = await newProject();
    const input = { project: p.key, confirmKey: p.key };
    const message = 'Only owners and admins can delete a project.';
    await expect(deleteProject(ctx, world.memberActor, input)).rejects.toThrow(new Forbidden(message));
    await expect(deleteProject(ctx, world.agentActor, input)).rejects.toThrow(new Forbidden(message));
    await expect(deleteProject(ctx, { ...world.agentActor, role: 'admin' }, input)).rejects.toThrow(
      new Forbidden(message),
    );
    // A key scoped to the project, even an owner's write key, cannot delete it.
    const ownerScoped: Actor = {
      ...world.ownerActor,
      scope: { projects: [p.id], access: 'write' },
      apiKeyId: 'k',
    };
    await expect(deleteProject(ctx, ownerScoped, input)).rejects.toThrow(new Forbidden(message));
    await expect(
      deleteProject(ctx, keyActor(world, { projects: [p.id], access: 'write' }), input),
    ).rejects.toThrow(Forbidden);
    // A key that does not cover the project does not see it.
    const other = await newProject();
    await expect(
      deleteProject(
        ctx,
        { ...world.ownerActor, scope: { projects: [other.id], access: 'write' }, apiKeyId: 'k' },
        input,
      ),
    ).rejects.toThrow(new Forbidden('Your API key does not cover this project'));
    // An owner's workspace-wide write key may.
    const ownerKey: Actor = {
      ...world.ownerActor,
      scope: { projects: 'all', access: 'write' },
      apiKeyId: 'k',
    };
    await deleteProject(ctx, ownerKey, input);
    await expect(deleteProject(ctx, ownerKey, input)).rejects.toThrow(NotFound);
  });

  it("needs the key typed again and finds projects in the actor's workspace only", async () => {
    const p = await newProject();
    const error = await deleteProject(ctx, world.ownerActor, { project: p.key, confirmKey: 'NOPE' }).catch(
      (e) => e,
    );
    expect(error).toBeInstanceOf(Invalid);
    expect(error.issues).toEqual([{ path: 'confirmKey', message: 'Type the project key to confirm' }]);
    const elsewhere = await createWorld(ctx.db, 'Elsewhere');
    await expect(
      deleteProject(ctx, elsewhere.ownerActor, { project: p.key, confirmKey: p.key }),
    ).rejects.toThrow(NotFound);
    expect((await listProjects(ctx, world.ownerActor)).items.map((row) => row.key)).toContain(p.key);
  });

  it('removes every child row: milestones, cycles, tasks, activity, comments, mentions, rollovers, the source and its files', async () => {
    const mirror = await createMirroredProject(ctx.db, world);
    const projectId = mirror.project.id;
    const native = await createTaskRow(ctx.db, projectId, { createdById: world.owner.id });
    const cycle = await createCycleRow(ctx.db, mirror.scope);
    const next = await createCycleRow(ctx.db, mirror.scope, { startsOn: '2099-01-01', endsOn: '2099-01-14' });
    await ctx.db
      .insert(schema.cycleRollover)
      .values({ cycleId: cycle.id, taskId: native.id, toCycleId: next.id, statusAtEnd: 'todo' });
    const comment = await createCommentRow(ctx.db, mirror.scope, {
      taskId: native.id,
      authorId: world.owner.id,
    });
    await ctx.db.insert(schema.commentMention).values({ commentId: comment.id, userId: world.member.id });
    await ctx.db.insert(schema.activity).values([
      { ...mirror.scope, taskId: native.id, actorId: world.owner.id, type: 'task.created' },
      { ...mirror.scope, taskId: null, actorId: world.owner.id, type: 'project.backlog_imported' },
    ]);
    const tasks = await ctx.db
      .select({ id: schema.task.id })
      .from(schema.task)
      .where(eq(schema.task.projectId, projectId));
    const ids = {
      projectId,
      taskIds: tasks.map((row) => row.id),
      cycleIds: [cycle.id, next.id],
      commentIds: [comment.id],
      sourceIds: [mirror.source.id],
    };
    const before = await childCounts(ctx.db, ids);
    for (const [table, n] of Object.entries(before)) expect(n, table).toBeGreaterThan(0);

    const logger = captureLogger();
    await deleteProject({ ...ctx, logger }, world.ownerActor, {
      project: mirror.key,
      confirmKey: mirror.key,
    });

    expect(await childCounts(ctx.db, ids)).toEqual({
      project: 0,
      milestone: 0,
      cycle: 0,
      task: 0,
      activity: 0,
      cycleRollover: 0,
      comment: 0,
      commentMention: 0,
      backlogSource: 0,
      backlogFile: 0,
    });
    // The connection is the workspace's and stays.
    const [connection] = await ctx.db
      .select({ id: schema.gitConnection.id })
      .from(schema.gitConnection)
      .where(eq(schema.gitConnection.id, mirror.connection.id));
    expect(connection).toBeDefined();
    expect(logger.lines).toEqual([
      {
        msg: 'project deleted',
        fields: {
          actorId: world.owner.id,
          onBehalfOfId: null,
          apiKeyId: null,
          workspaceId: world.workspaceId,
          projectKey: mirror.key,
          projectId,
          taskCount: before.task,
          backlogSource: true,
          apiKeysUpdated: 0,
        },
      },
    ]);
  });

  it('logs a project without a source as such', async () => {
    const logger = captureLogger();
    const p = await newProject();
    await createTask(ctx, world.ownerActor, { project: p.key, title: 'One' });
    await deleteProject({ ...ctx, logger }, world.ownerActor, { project: p.key, confirmKey: p.key });
    expect(logger.lines[0]?.fields).toMatchObject({ projectKey: p.key, taskCount: 1, backlogSource: false });
  });

  it('strips the project from API key scopes and keeps the keys', async () => {
    const doomed = await newProject();
    const kept = await newProject();
    const both = await createApiKey(ctx, world.memberActor, {
      name: 'Both',
      scope: { projects: [doomed.id, kept.id], access: 'write' },
    });
    const only = await createApiKey(ctx, world.memberActor, {
      name: 'Only',
      scope: { projects: [doomed.id], access: 'read' },
    });
    const all = await createApiKey(ctx, world.memberActor, {
      name: 'All',
      scope: { projects: 'all', access: 'write' },
    });
    const logger = captureLogger();
    await deleteProject({ ...ctx, logger }, world.ownerActor, {
      project: doomed.key,
      confirmKey: doomed.key,
    });
    expect(logger.lines[0]?.fields.apiKeysUpdated).toBe(2);

    const rows = await ctx.db
      .select({ id: schema.apikey.id, metadata: schema.apikey.metadata, enabled: schema.apikey.enabled })
      .from(schema.apikey)
      .where(inArray(schema.apikey.id, [both.id, only.id, all.id]));
    const byId = new Map(rows.map((row) => [row.id, row]));
    expect(readKeyMetadata(byId.get(both.id)?.metadata)).toEqual({
      workspaceId: world.workspaceId,
      projects: [kept.id],
      access: 'write',
    });
    expect(readKeyMetadata(byId.get(only.id)?.metadata)).toEqual({
      workspaceId: world.workspaceId,
      projects: [],
      access: 'read',
    });
    expect(readKeyMetadata(byId.get(all.id)?.metadata)?.projects).toBe('all');
    expect(rows.every((row) => row.enabled)).toBe(true);

    // Better Auth still reads the rewritten metadata; the emptied key covers nothing.
    const headers = (key: string) => ({ headers: new Headers({ authorization: `Bearer ${key}` }) });
    const actorBoth = await getActorFromRequest(ctx, headers(both.key));
    expect(actorBoth?.scope).toEqual({ projects: [kept.id], access: 'write' });
    const actorOnly = await getActorFromRequest(ctx, headers(only.key));
    expect(actorOnly?.scope).toEqual({ projects: [], access: 'read' });

    const listed = await listApiKeys(ctx, world.memberActor, { owner: 'me' });
    expect(listed.find((key) => key.id === only.id)?.scope).toEqual({ projects: [], access: 'read' });
    expect(listed.find((key) => key.id === both.id)?.scope.projects).toEqual([
      expect.objectContaining({ id: kept.id, key: kept.key }),
    ]);
  });

  it('leaves keys of other workspaces alone', async () => {
    const p = await newProject();
    // A key whose metadata names the id but belongs to another workspace (forged, or a bad copy).
    const other = await createWorld(ctx.db, 'Other');
    const otherProject = await createProject(ctx, other.ownerActor, {
      name: 'Other',
      key: randomProjectKey(),
    });
    const key = await createApiKey(ctx, other.memberActor, {
      name: 'Other key',
      scope: { projects: [otherProject.id], access: 'read' },
    });
    const forged = JSON.stringify({
      workspaceId: other.workspaceId,
      projects: [otherProject.id, p.id],
      access: 'read',
    });
    await ctx.db.update(schema.apikey).set({ metadata: forged }).where(eq(schema.apikey.id, key.id));
    await deleteProject(ctx, world.ownerActor, { project: p.key, confirmKey: p.key });
    const [row] = await ctx.db
      .select({ metadata: schema.apikey.metadata })
      .from(schema.apikey)
      .where(eq(schema.apikey.id, key.id));
    expect(row?.metadata).toBe(forged);
  });

  describe('with a running Backlog.md mirror', () => {
    let provider: DeletingProvider;
    let mirrorCtx: ReturnType<typeof mirrorContext>;

    beforeAll(() => {
      provider = new DeletingProvider([]);
      mirrorCtx = mirrorContext(ctx, provider);
    });

    it('a refresh that runs after the deletion skips', async () => {
      const repo = provider.add(smallRepo());
      const { key, sourceId, first } = await createMirror(mirrorCtx, world, repo);
      expect(first?.outcome).toBe('applied');
      await deleteProject(mirrorCtx, world.ownerActor, { project: key, confirmKey: key });
      repo.set(taskPath('backlog', 'back-3', 'Third'), taskFile({ id: 'BACK-3', title: 'Third' }));
      repo.commit();
      await expect(refreshBacklogSource(mirrorCtx, sourceId, 'webhook')).resolves.toEqual({
        outcome: 'skipped',
        state: null,
      });
    });

    it('a refresh reading while the project is deleted skips and writes nothing', async () => {
      const repo = provider.add(smallRepo());
      const { project, key, sourceId } = await createMirror(mirrorCtx, world, repo);
      repo.set(taskPath('backlog', 'back-3', 'Third'), taskFile({ id: 'BACK-3', title: 'Third' }));
      repo.commit();
      provider.onHead = () => deleteProject(mirrorCtx, world.ownerActor, { project: key, confirmKey: key });
      await expect(refreshBacklogSource(mirrorCtx, sourceId, 'webhook')).resolves.toEqual({
        outcome: 'skipped',
        state: 'detached',
      });
      const tasks = await ctx.db
        .select({ id: schema.task.id })
        .from(schema.task)
        .where(eq(schema.task.projectId, project.id));
      expect(tasks).toEqual([]);
      const sources = await ctx.db
        .select({ id: schema.backlogSource.id })
        .from(schema.backlogSource)
        .where(eq(schema.backlogSource.id, sourceId));
      expect(sources).toEqual([]);
    });
  });
});
