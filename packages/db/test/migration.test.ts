// Upgrade path: a database migrated and filled under M1 keeps every row through the M2 migration,
// and the backfilled task.rank reproduces the M1 list order inside each status column.
import { cpSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { migrate as drizzleMigrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, dropDatabase, withDatabase } from '../src/admin';
import { createDb, type Db } from '../src/client';
import { migrationsFolder } from '../src/migrate';
import { testServerUrl, uniqueDatabaseName } from './index';

const M1_MIGRATION = '20261022182359_init';

/** Applies the migrations in `folder` to the database at `url`. */
async function migrateFrom(url: string, folder: string) {
  const { db, pool } = createDb(url, { max: 1 });
  try {
    await drizzleMigrate(db, { migrationsFolder: folder });
  } finally {
    await pool.end();
  }
}

const TABLES = ['user', 'organization', 'member', 'project', 'task', 'activity'] as const;

async function rowCounts(db: Db) {
  const counts: Record<string, number> = {};
  for (const table of TABLES) {
    const result = await db.execute<{ count: number }>(
      sql`select count(*)::int as count from ${sql.identifier(table)}`,
    );
    counts[table] = result.rows[0]?.count ?? -1;
  }
  return counts;
}

/** Task ids per (project, status) in the M1 list order: priority desc, updated_at desc, id desc. */
async function m1Order(db: Db) {
  const result = await db.execute<{ id: string; project_id: string; status: string }>(sql`
    select id, project_id, status::text as status from task
    order by project_id, status, priority desc, updated_at desc, id desc`);
  const groups = new Map<string, string[]>();
  for (const row of result.rows) {
    const group = `${row.project_id}/${row.status}`;
    groups.set(group, [...(groups.get(group) ?? []), row.id]);
  }
  return groups;
}

describe('M2 migration on an M1 database with data', () => {
  let url: string;
  let m1Folder: string;
  let db: Db;
  let end: () => Promise<void>;

  beforeAll(async () => {
    m1Folder = mkdtempSync(join(tmpdir(), 'pm-m1-migrations-'));
    cpSync(join(migrationsFolder, M1_MIGRATION), join(m1Folder, M1_MIGRATION), { recursive: true });
    url = withDatabase(testServerUrl(), uniqueDatabaseName('pm_test_upgrade'));
    await createDatabase(url);
    await migrateFrom(url, m1Folder);
    const handle = createDb(url);
    db = handle.db;
    end = () => handle.pool.end();
  });

  afterAll(async () => {
    await end?.();
    if (url) await dropDatabase(url);
    if (m1Folder) rmSync(m1Folder, { recursive: true, force: true });
  });

  it('keeps every row and backfills rank in the M1 list order', async () => {
    expect(readdirSync(migrationsFolder).length).toBeGreaterThan(1);

    // M1 data, written with raw SQL against the M1 schema (the Drizzle schema already has M2 columns).
    await db.execute(sql`
      insert into "user" (id, name, email) values
        ('0190a1b2-0000-7000-8000-0000000000a1', 'Ana', 'ana@example.com'),
        ('0190a1b2-0000-7000-8000-0000000000a2', 'claude-dev', 'claude-dev@agents.invalid')`);
    await db.execute(sql`update "user" set kind = 'agent', responsible_user_id = '0190a1b2-0000-7000-8000-0000000000a1'
      where id = '0190a1b2-0000-7000-8000-0000000000a2'`);
    await db.execute(sql`
      insert into organization (id, name, slug) values ('0190a1b2-0000-7000-8000-0000000000b1', 'Reddevs', 'reddevs')`);
    await db.execute(sql`
      insert into member (organization_id, user_id, role) values
        ('0190a1b2-0000-7000-8000-0000000000b1', '0190a1b2-0000-7000-8000-0000000000a1', 'owner'),
        ('0190a1b2-0000-7000-8000-0000000000b1', '0190a1b2-0000-7000-8000-0000000000a2', 'member')`);
    await db.execute(sql`
      insert into project (id, workspace_id, key, name, next_task_number) values
        ('0190a1b2-0000-7000-8000-0000000000c1', '0190a1b2-0000-7000-8000-0000000000b1', 'PAY', 'Payments', 41),
        ('0190a1b2-0000-7000-8000-0000000000c2', '0190a1b2-0000-7000-8000-0000000000b1', 'WEB', 'Website', 1)`);

    // 40 PAY tasks spread over every status, with repeated priorities and timestamps so the
    // updated_at and id tie-breakers matter. WEB stays empty.
    const statuses = ['backlog', 'todo', 'in_progress', 'in_review', 'done', 'canceled'];
    for (let number = 1; number <= 40; number++) {
      const status = statuses[number % statuses.length];
      const priority = number % 5;
      const day = 1 + (number % 4);
      await db.execute(sql`
        insert into task (project_id, number, title, status, priority, assignee_id, created_by_id, updated_at)
        values ('0190a1b2-0000-7000-8000-0000000000c1', ${number}, ${`Task ${number}`}, ${status}::task_status,
          ${priority}, ${number % 3 === 0 ? '0190a1b2-0000-7000-8000-0000000000a2' : null},
          '0190a1b2-0000-7000-8000-0000000000a1', ${`2026-10-0${day}T12:00:00.123456Z`}::timestamptz)`);
    }
    await db.execute(sql`
      insert into activity (workspace_id, project_id, task_id, actor_id, on_behalf_of_id, type, changes)
      select '0190a1b2-0000-7000-8000-0000000000b1', project_id, id, '0190a1b2-0000-7000-8000-0000000000a2',
        '0190a1b2-0000-7000-8000-0000000000a1', 'task.created', '[{"field":"title","from":null,"to":"x"}]'::jsonb
      from task`);

    const countsBefore = await rowCounts(db);
    const orderBefore = await m1Order(db);
    const updatedBefore = await db.execute<{ id: string; updated_at: string }>(
      sql`select id, updated_at::text as updated_at from task order by id`,
    );

    await migrateFrom(url, migrationsFolder);

    expect(await rowCounts(db)).toEqual(countsBefore);
    expect(countsBefore.task).toBe(40);

    // Each status column numbers 1..n in the M1 order.
    const ranks = await db.execute<{ id: string; project_id: string; status: string; rank: number }>(sql`
      select id, project_id, status::text as status, rank from task order by project_id, status, rank`);
    const orderAfter = new Map<string, string[]>();
    for (const row of ranks.rows) {
      const group = `${row.project_id}/${row.status}`;
      const ids = [...(orderAfter.get(group) ?? []), row.id];
      orderAfter.set(group, ids);
      expect(row.rank).toBe(ids.length);
    }
    expect(orderAfter).toEqual(orderBefore);

    // The backfill leaves updated_at alone (it carries microseconds; compare as text).
    const updatedAfter = await db.execute<{ id: string; updated_at: string }>(
      sql`select id, updated_at::text as updated_at from task order by id`,
    );
    expect(updatedAfter.rows).toEqual(updatedBefore.rows);

    const projects = await db.execute<{
      uses_milestones: boolean;
      uses_cycles: boolean;
      next_cycle_number: number;
    }>(sql`select uses_milestones, uses_cycles, next_cycle_number from project`);
    expect(projects.rows).toEqual([
      { uses_milestones: true, uses_cycles: true, next_cycle_number: 1 },
      { uses_milestones: true, uses_cycles: true, next_cycle_number: 1 },
    ]);

    const tasks = await db.execute<{ empty: number }>(sql`
      select count(*)::int as empty from task
      where milestone_id is null and cycle_id is null and cycle_added_at is null`);
    expect(tasks.rows[0]?.empty).toBe(40);

    const themes = await db.execute<{ theme: string }>(sql`select distinct theme from "user"`);
    expect(themes.rows).toEqual([{ theme: 'system' }]);

    const actors = await db.execute<{ missing: number }>(
      sql`select count(*)::int as missing from activity where actor_id is null`,
    );
    expect(actors.rows[0]?.missing).toBe(0);
  });
});

const M2_1_MIGRATIONS = [
  '20261022182359_init',
  '20261023083529_m2_work_views',
  '20261023144736_m2_1_project_repository',
];

describe('M3 migration on an M2.1 database with data', () => {
  let url: string;
  let folder: string;
  let db: Db;
  let end: () => Promise<void>;

  const OWNER = '0190a1b2-0000-7000-8000-0000000000a1';
  const WORKSPACE = '0190a1b2-0000-7000-8000-0000000000b1';
  const PAY = '0190a1b2-0000-7000-8000-0000000000c1';
  const WEB = '0190a1b2-0000-7000-8000-0000000000c2';

  beforeAll(async () => {
    folder = mkdtempSync(join(tmpdir(), 'pm-m2-1-migrations-'));
    for (const name of M2_1_MIGRATIONS) {
      cpSync(join(migrationsFolder, name), join(folder, name), { recursive: true });
    }
    url = withDatabase(testServerUrl(), uniqueDatabaseName('pm_test_upgrade_m3'));
    await createDatabase(url);
    await migrateFrom(url, folder);
    const handle = createDb(url);
    db = handle.db;
    end = () => handle.pool.end();
  });

  afterAll(async () => {
    await end?.();
    if (url) await dropDatabase(url);
    if (folder) rmSync(folder, { recursive: true, force: true });
  });

  /** Task keys as M2.1 builds them: project key, dash, number. */
  async function keys() {
    const result = await db.execute<{ key: string }>(sql`
      select p.key || '-' || t.number as key from task t join project p on p.id = t.project_id
      order by p.key, t.number`);
    return result.rows.map((row) => row.key);
  }

  async function insertTask(projectId: string, number: number, keySuffix?: string) {
    if (keySuffix === undefined) {
      return db.execute(sql`insert into task (project_id, number, title, created_by_id)
        values (${projectId}, ${number}, ${`Task ${number}`}, ${OWNER})`);
    }
    return db.execute(sql`insert into task (project_id, number, key_suffix, title, created_by_id)
      values (${projectId}, ${number}, ${keySuffix}, ${`Task ${number}.${keySuffix}`}, ${OWNER})`);
  }

  async function pgCode(promise: Promise<unknown>): Promise<string | undefined> {
    try {
      await promise;
    } catch (error) {
      const cause = (error as { cause?: { code?: string } }).cause;
      return cause?.code ?? (error as { code?: string }).code;
    }
    return undefined;
  }

  it('keeps every task key, row and activity, and the one-task-per-number rule', async () => {
    // M2.1 data, written with raw SQL against the M2.1 schema.
    await db.execute(sql`insert into "user" (id, name, email) values (${OWNER}, 'Ana', 'ana@example.com')`);
    await db.execute(
      sql`insert into organization (id, name, slug) values (${WORKSPACE}, 'Reddevs', 'reddevs')`,
    );
    await db.execute(
      sql`insert into member (organization_id, user_id, role) values (${WORKSPACE}, ${OWNER}, 'owner')`,
    );
    await db.execute(sql`
      insert into project (id, workspace_id, key, name, next_task_number, repository, repository_key) values
        (${PAY}, ${WORKSPACE}, 'PAY', 'Payments', 26, 'git@gitlab.com:reddevs/payments.git', 'gitlab.com/reddevs/payments'),
        (${WEB}, ${WORKSPACE}, 'WEB', 'Website', 4, null, null)`);
    for (let number = 1; number <= 25; number++) await insertTask(PAY, number);
    for (let number = 1; number <= 3; number++) await insertTask(WEB, number);
    await db.execute(sql`
      insert into activity (workspace_id, project_id, task_id, actor_id, type, changes)
      select ${WORKSPACE}, project_id, id, ${OWNER}, 'task.created', '[]'::jsonb from task`);
    await db.execute(sql`
      insert into activity (workspace_id, project_id, task_id, actor_id, type, changes)
      select ${WORKSPACE}, project_id, id, null, 'cycle.ended', '[{"field":"cycle","from":null,"to":null}]'::jsonb
      from task where number = 1`);

    const keysBefore = await keys();
    const counts = await rowCounts(db);

    await migrateFrom(url, migrationsFolder);

    expect(await keys()).toEqual(keysBefore);
    expect(keysBefore).toHaveLength(28);
    expect(await rowCounts(db)).toEqual(counts);

    const tasks = await db.execute<{ untouched: number }>(sql`
      select count(*)::int as untouched from task
      where key_suffix is null and backlog_id is null and backlog_data is null and hidden_at is null`);
    expect(tasks.rows[0]?.untouched).toBe(28);

    const origins = await db.execute<{ origin: string; origin_ref: string | null; count: number }>(sql`
      select origin, origin_ref, count(*)::int as count from activity group by origin, origin_ref`);
    expect(origins.rows).toEqual([{ origin: 'app', origin_ref: null, count: 30 }]);

    const milestones = await db.execute<{ count: number }>(
      sql`select count(*)::int as count from milestone where backlog_id is not null or hidden_at is not null`,
    );
    expect(milestones.rows[0]?.count).toBe(0);

    // Old rule: one task per number in a project, numbers repeat across projects.
    expect(await pgCode(insertTask(PAY, 1))).toBe('23505');
    await insertTask(WEB, 25);

    // New rule: subtasks share the number with distinct suffixes; the same suffix twice is refused.
    await insertTask(PAY, 7, '1');
    await insertTask(PAY, 7, '2');
    await insertTask(PAY, 7, '1.2');
    expect(await pgCode(insertTask(PAY, 7, '1'))).toBe('23505');
    expect(await pgCode(insertTask(PAY, 7, '0'))).toBe('23514');
    expect(await pgCode(insertTask(PAY, 7, '1.'))).toBe('23514');
    expect(await pgCode(insertTask(PAY, 7, '01'))).toBe('23514');

    const index = await db.execute<{ indexname: string }>(
      sql`select indexname from pg_indexes where tablename = 'task' and indexname = 'task_projectId_number_unique'`,
    );
    expect(index.rows).toEqual([]);
  });
});
