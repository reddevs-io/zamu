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
