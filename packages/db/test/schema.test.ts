import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type Db, type Tx } from '../src/client';
import { organization, project, task, user } from '../src/schema';
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
      'invitation',
      'member',
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
