import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type Db, type Tx } from '../src/client';
import {
  activity,
  comment,
  commentMention,
  cycle,
  cycleRollover,
  milestone,
  organization,
  project,
  task,
  user,
} from '../src/schema';
import { createTestDatabase, sharedTestDatabaseUrl, type TestDatabase } from './index';

/** Postgres wraps constraint errors in DrizzleQueryError; the pg error sits in `cause`. */
async function pgErrorCode(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (error) {
    const cause = (error as { cause?: { code?: string } }).cause;
    return cause?.code ?? (error as { code?: string }).code;
  }
  return undefined;
}

async function seed(db: Db | Tx) {
  const [owner] = await db
    .insert(user)
    .values({ name: 'Ada', email: `ada-${crypto.randomUUID()}@example.com` })
    .returning();
  const [workspace] = await db
    .insert(organization)
    .values({ name: 'Reddevs', slug: `reddevs-${crypto.randomUUID()}` })
    .returning();
  if (!owner || !workspace) throw new Error('seed failed');
  const [pay] = await db
    .insert(project)
    .values({ workspaceId: workspace.id, key: 'PAY', name: 'Payments' })
    .returning();
  if (!pay) throw new Error('seed failed');
  return { owner, workspace, pay };
}

describe('schema on a throwaway database', () => {
  let database: TestDatabase;
  let db: Db;

  beforeAll(async () => {
    database = await createTestDatabase();
    db = database.db;
  });

  afterAll(async () => {
    await database?.drop();
  });

  it('creates every table from the domain model', async () => {
    const result = await db.execute<{ table_name: string }>(
      sql`select table_name from information_schema.tables where table_schema = 'public' order by table_name`,
    );
    expect(result.rows.map((row) => row.table_name)).toEqual([
      'account',
      'activity',
      'apikey',
      'comment',
      'comment_mention',
      'cycle',
      'cycle_rollover',
      'invitation',
      'member',
      'milestone',
      'organization',
      'project',
      'session',
      'task',
      'user',
      'verification',
    ]);
  });

  it('generates uuidv7 ids and defaults kind to person', async () => {
    const { owner, pay } = await seed(db);
    expect(owner.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(pay.id.charAt(14)).toBe('7');
    expect(owner.kind).toBe('person');
    expect(pay.nextTaskNumber).toBe(1);
  });

  it('rejects an invalid user kind, project key and priority', async () => {
    const { owner, pay } = await seed(db);
    expect(await pgErrorCode(db.execute(sql`update "user" set kind = 'robot' where id = ${owner.id}`))).toBe(
      '23514',
    );
    expect(
      await pgErrorCode(
        db.insert(project).values({ workspaceId: pay.workspaceId, key: 'pay', name: 'Lower' }),
      ),
    ).toBe('23514');
    expect(
      await pgErrorCode(
        db.insert(project).values({ workspaceId: pay.workspaceId, key: '1AB', name: 'Digit' }),
      ),
    ).toBe('23514');
    expect(
      await pgErrorCode(
        db
          .insert(task)
          .values({ projectId: pay.id, number: 1, title: 'Too urgent', priority: 5, createdById: owner.id }),
      ),
    ).toBe('23514');
    expect(
      await pgErrorCode(
        db.execute(sql`insert into task (project_id, number, title, status, created_by_id)
        values (${pay.id}, 1, 'Bad status', 'started', ${owner.id})`),
      ),
    ).toBe('22P02');
  });

  it('keeps project keys unique per workspace and task numbers unique per project', async () => {
    const { owner, workspace, pay } = await seed(db);
    expect(
      await pgErrorCode(db.insert(project).values({ workspaceId: workspace.id, key: 'PAY', name: 'Again' })),
    ).toBe('23505');

    const other = await seed(db);
    expect(other.pay.key).toBe('PAY');

    await db.insert(task).values({ projectId: pay.id, number: 1, title: 'First', createdById: owner.id });
    expect(
      await pgErrorCode(
        db.insert(task).values({ projectId: pay.id, number: 1, title: 'Dup', createdById: owner.id }),
      ),
    ).toBe('23505');
  });

  it('allocates task numbers inside a transaction and loads relations', async () => {
    const { owner, pay } = await seed(db);
    const created = await db.transaction(async (tx: Tx) => {
      const [counter] = await tx
        .update(project)
        .set({ nextTaskNumber: sql`${project.nextTaskNumber} + 1` })
        .where(eq(project.id, pay.id))
        .returning({ number: sql<number>`${project.nextTaskNumber} - 1` });
      if (!counter) throw new Error('project not found');
      const [row] = await tx
        .insert(task)
        .values({ projectId: pay.id, number: counter.number, title: 'Ship it', createdById: owner.id })
        .returning();
      return row;
    });
    expect(created?.number).toBe(1);
    expect(created?.status).toBe('todo');
    expect(created?.priority).toBe(0);

    const loaded = await db.query.task.findFirst({
      where: { id: created?.id },
      with: { project: true, createdBy: true },
    });
    expect(loaded?.project.key).toBe('PAY');
    expect(loaded?.createdBy.id).toBe(owner.id);
  });
});

describe('M2 schema', () => {
  let database: TestDatabase;
  let db: Db;

  beforeAll(async () => {
    database = await createTestDatabase();
    db = database.db;
  });

  afterAll(async () => {
    await database?.drop();
  });

  async function newMilestone(world: Awaited<ReturnType<typeof seed>>, name: string) {
    const [row] = await db
      .insert(milestone)
      .values({ workspaceId: world.workspace.id, projectId: world.pay.id, name, createdById: world.owner.id })
      .returning();
    if (!row) throw new Error('milestone insert failed');
    return row;
  }

  async function newCycle(
    world: Awaited<ReturnType<typeof seed>>,
    number: number,
    startsOn: string,
    endsOn: string,
  ) {
    const [row] = await db
      .insert(cycle)
      .values({ workspaceId: world.workspace.id, projectId: world.pay.id, number, startsOn, endsOn })
      .returning();
    if (!row) throw new Error('cycle insert failed');
    return row;
  }

  it('defaults the new project, task and user columns', async () => {
    const world = await seed(db);
    expect(world.pay).toMatchObject({ usesMilestones: true, usesCycles: true, nextCycleNumber: 1 });
    expect(world.owner.theme).toBe('system');
    const [row] = await db
      .insert(task)
      .values({ projectId: world.pay.id, number: 1, title: 'Defaults', createdById: world.owner.id })
      .returning();
    expect(row).toMatchObject({ milestoneId: null, cycleId: null, cycleAddedAt: null, rank: 0 });
  });

  it('checks the theme', async () => {
    const { owner } = await seed(db);
    await db.update(user).set({ theme: 'dark' }).where(eq(user.id, owner.id));
    expect(await pgErrorCode(db.execute(sql`update "user" set theme = 'sepia' where id = ${owner.id}`))).toBe(
      '23514',
    );
  });

  it('keeps milestone names unique per project ignoring case, and starts them planned', async () => {
    const world = await seed(db);
    const webhooks = await newMilestone(world, 'Webhooks v2');
    expect(webhooks.status).toBe('planned');
    expect(webhooks.targetDate).toBeNull();
    expect(await pgErrorCode(newMilestone(world, 'WEBHOOKS V2'))).toBe('23505');
    expect(await pgErrorCode(newMilestone(world, ''))).toBe('23514');

    const other = await seed(db);
    await expect(newMilestone(other, 'Webhooks v2')).resolves.toBeTruthy();

    await db.update(milestone).set({ targetDate: '2026-11-14' }).where(eq(milestone.id, webhooks.id));
    const reloaded = await db.query.milestone.findFirst({ where: { id: webhooks.id } });
    expect(reloaded?.targetDate).toBe('2026-11-14');
  });

  it('checks cycle numbers and dates', async () => {
    const world = await seed(db);
    await newCycle(world, 1, '2026-10-26', '2026-11-08');
    expect(await pgErrorCode(newCycle(world, 1, '2026-11-09', '2026-11-22'))).toBe('23505');
    expect(await pgErrorCode(newCycle(world, 2, '2026-11-09', '2026-11-08'))).toBe('23514');
    // 56 days, both ends included, is the longest cycle.
    await expect(newCycle(world, 2, '2026-11-09', '2027-01-03')).resolves.toBeTruthy();
    expect(await pgErrorCode(newCycle(world, 3, '2027-01-04', '2027-03-01'))).toBe('23514');
    expect(await pgErrorCode(newCycle(world, 0, '2027-01-04', '2027-01-04'))).toBe('23514');
  });

  it('clears milestone and cycle from tasks when they are deleted', async () => {
    const world = await seed(db);
    const ms = await newMilestone(world, 'Launch');
    const c1 = await newCycle(world, 1, '2026-10-26', '2026-11-08');
    const [row] = await db
      .insert(task)
      .values({
        projectId: world.pay.id,
        number: 1,
        title: 'Planned',
        createdById: world.owner.id,
        milestoneId: ms.id,
        cycleId: c1.id,
        cycleAddedAt: new Date(),
        rank: -1.5,
      })
      .returning();
    if (!row) throw new Error('task insert failed');

    const loaded = await db.query.task.findFirst({
      where: { id: row.id },
      with: { milestone: true, cycle: true },
    });
    expect(loaded?.milestone?.name).toBe('Launch');
    expect(loaded?.cycle?.number).toBe(1);
    expect(loaded?.rank).toBe(-1.5);

    await db.delete(milestone).where(eq(milestone.id, ms.id));
    await db.delete(cycle).where(eq(cycle.id, c1.id));
    const cleared = await db.query.task.findFirst({ where: { id: row.id } });
    expect(cleared).toMatchObject({ milestoneId: null, cycleId: null });
  });

  it('records cycle rollovers once per task', async () => {
    const world = await seed(db);
    const c1 = await newCycle(world, 1, '2026-10-12', '2026-10-25');
    const c2 = await newCycle(world, 2, '2026-10-26', '2026-11-08');
    const [row] = await db
      .insert(task)
      .values({ projectId: world.pay.id, number: 1, title: 'Unfinished', createdById: world.owner.id })
      .returning();
    if (!row) throw new Error('task insert failed');
    await db
      .insert(cycleRollover)
      .values({ cycleId: c1.id, taskId: row.id, toCycleId: c2.id, statusAtEnd: 'todo' });
    expect(
      await pgErrorCode(
        db
          .insert(cycleRollover)
          .values({ cycleId: c1.id, taskId: row.id, toCycleId: null, statusAtEnd: 'todo' }),
      ),
    ).toBe('23505');
    const loaded = await db.query.cycle.findFirst({
      where: { id: c1.id },
      with: { rollovers: { with: { toCycle: true, task: true } } },
    });
    expect(loaded?.rollovers).toHaveLength(1);
    expect(loaded?.rollovers[0]?.toCycle?.number).toBe(2);
    expect(loaded?.rollovers[0]?.task.title).toBe('Unfinished');
  });

  it('keeps comment bodies until a soft delete, and mentions per user once', async () => {
    const world = await seed(db);
    const [row] = await db
      .insert(task)
      .values({ projectId: world.pay.id, number: 1, title: 'Discussed', createdById: world.owner.id })
      .returning();
    if (!row) throw new Error('task insert failed');
    const base = {
      workspaceId: world.workspace.id,
      projectId: world.pay.id,
      taskId: row.id,
      authorId: world.owner.id,
    };
    const [note] = await db
      .insert(comment)
      .values({ ...base, body: `Ping [@Ada](mention:${world.owner.id})` })
      .returning();
    if (!note) throw new Error('comment insert failed');
    expect(note).toMatchObject({ editedAt: null, deletedAt: null, onBehalfOfId: null });
    await db.insert(commentMention).values({ commentId: note.id, userId: world.owner.id });
    expect(
      await pgErrorCode(db.insert(commentMention).values({ commentId: note.id, userId: world.owner.id })),
    ).toBe('23505');

    // A body without deleted_at, or deleted_at with a body, is rejected.
    expect(await pgErrorCode(db.insert(comment).values({ ...base, body: null }))).toBe('23514');
    expect(await pgErrorCode(db.insert(comment).values({ ...base, body: 'x', deletedAt: new Date() }))).toBe(
      '23514',
    );
    await db.update(comment).set({ body: null, deletedAt: new Date() }).where(eq(comment.id, note.id));

    const loaded = await db.query.task.findFirst({
      where: { id: row.id },
      with: { comments: { with: { author: true, mentions: true } } },
    });
    expect(loaded?.comments[0]?.body).toBeNull();
    expect(loaded?.comments[0]?.author.id).toBe(world.owner.id);
    expect(loaded?.comments[0]?.mentions).toHaveLength(1);
  });

  it('allows system activity without an actor', async () => {
    const world = await seed(db);
    const [row] = await db
      .insert(task)
      .values({ projectId: world.pay.id, number: 1, title: 'Rolled over', createdById: world.owner.id })
      .returning();
    if (!row) throw new Error('task insert failed');
    const [entry] = await db
      .insert(activity)
      .values({
        workspaceId: world.workspace.id,
        projectId: world.pay.id,
        taskId: row.id,
        actorId: null,
        type: 'cycle.ended',
        changes: [{ field: 'cycle', from: null, to: null }],
      })
      .returning();
    const loaded = await db.query.activity.findFirst({ where: { id: entry?.id }, with: { actor: true } });
    expect(loaded?.actor).toBeNull();
    expect(loaded?.type).toBe('cycle.ended');
  });
});

describe('globalSetup database', () => {
  it('is migrated and reachable through sharedTestDatabaseUrl()', async () => {
    const { db, pool } = createDb(sharedTestDatabaseUrl());
    try {
      const result = await db.execute<{ count: number }>(sql`select count(*)::int as count from project`);
      expect(result.rows[0]?.count).toBe(0);
    } finally {
      await pool.end();
    }
  });
});
