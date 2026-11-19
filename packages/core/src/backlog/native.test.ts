// M5 native fields of mirrored tasks on Postgres: what a refresh writes (labels, due dates, parents,
// blockers and their activity), detach, and the backfill migration followed by a refresh. Runs on
// its own database: the backfill migration touches every mirrored task of the database it runs on.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createAuth } from '@zamu/auth';
import { type Db, schema } from '@zamu/db';
import { migrationsFolder } from '@zamu/db/migrate';
import { createTestDatabase, type TestDatabase } from '@zamu/db/test';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createWorld, TEST_PUBLIC_URL, TEST_SECRET, type TestContext, type World } from '../testing/fixtures';
import { refreshBacklogSource } from './refresh';
import { detachBacklog } from './settings';
import {
  configFile,
  createMirror,
  FakeProvider,
  FakeRepository,
  mirrorContext,
  projectActivity,
  taskFile,
  taskPath,
  tasksByKey,
} from './testing';

const FOLDER = 'backlog';
const BACKFILL = '20261104110039_m5_backfill_mirrors';

function repoWithFields(): FakeRepository {
  return new FakeRepository(`reddevs/fields-${crypto.randomUUID().slice(0, 8)}`, {
    [`${FOLDER}/config.yml`]: configFile(),
    [taskPath(FOLDER, 'back-1', 'First')]: taskFile({
      id: 'BACK-1',
      title: 'First',
      labels: ['API', 'backend'],
      due: '2026-11-20',
      dependencies: ['BACK-2'],
    }),
    [taskPath(FOLDER, 'back-2', 'Second')]: taskFile({ id: 'BACK-2', title: 'Second', labels: ['api'] }),
    [taskPath(FOLDER, 'back-2.1', 'Sub')]: taskFile({ id: 'BACK-2.1', title: 'Sub', due: '2026-02-30' }),
    [taskPath(FOLDER, 'back-3', 'Third')]: taskFile({
      id: 'BACK-3',
      title: 'Third',
      dependencies: ['BACK-1', 'BACK-99'],
      parent: 'BACK-1',
    }),
  });
}

/** Native fields of a project's tasks by key, with label names instead of ids. */
async function nativeState(db: Db, projectId: string, projectKey: string) {
  const tasks = await tasksByKey(db, projectId, projectKey);
  const keyOf = new Map([...tasks].map(([key, row]) => [row.id, key]));
  const ids = [...keyOf.keys()];
  const labels = await db
    .select({ taskId: schema.taskLabel.taskId, name: schema.label.name })
    .from(schema.taskLabel)
    .innerJoin(schema.label, eq(schema.label.id, schema.taskLabel.labelId))
    .where(inArray(schema.taskLabel.taskId, ids));
  const blockers = await db
    .select()
    .from(schema.taskDependency)
    .where(inArray(schema.taskDependency.taskId, ids));
  const state: Record<string, unknown> = {};
  for (const [key, row] of tasks) {
    state[key] = {
      dueDate: row.dueDate,
      parent: row.parentId ? keyOf.get(row.parentId) : null,
      labels: labels
        .filter((entry) => entry.taskId === row.id)
        .map((entry) => entry.name)
        .sort(),
      blockers: blockers
        .filter((entry) => entry.taskId === row.id)
        .map((entry) => keyOf.get(entry.blockerId))
        .sort(),
      hidden: row.hiddenAt !== null,
    };
  }
  return state;
}

async function projectLabels(db: Db, projectId: string) {
  const rows = await db
    .select({ name: schema.label.name, color: schema.label.color, source: schema.label.source })
    .from(schema.label)
    .where(eq(schema.label.projectId, projectId));
  return rows.sort((a, b) => (a.name < b.name ? -1 : 1));
}

describe('mirrored native fields', () => {
  let database: TestDatabase;
  let world: World;
  let provider: FakeProvider;
  let ctx: ReturnType<typeof mirrorContext>;

  beforeAll(async () => {
    database = await createTestDatabase({ prefix: 'pm_test_native' });
    const base: TestContext = {
      db: database.db,
      auth: createAuth({ db: database.db, secret: TEST_SECRET, baseUrl: TEST_PUBLIC_URL }),
      publicUrl: TEST_PUBLIC_URL,
      pool: database.pool,
      url: database.url,
      close: database.drop,
    };
    world = await createWorld(base.db);
    provider = new FakeProvider([]);
    ctx = mirrorContext(base, provider);
  });
  afterAll(async () => {
    await database?.drop();
  });

  async function mirror(repo: FakeRepository, options: Parameters<typeof createMirror>[3] = {}) {
    provider.add(repo);
    return createMirror(ctx, world, repo, options);
  }

  it('the first read fills labels, due dates, parents and blockers, with one activity row', async () => {
    const repo = repoWithFields();
    const { project, key, first } = await mirror(repo);
    expect(first?.outcome).toBe('applied');
    expect(await nativeState(ctx.db, project.id, key)).toEqual({
      [`${key}-1`]: {
        dueDate: '2026-11-20',
        parent: null,
        labels: ['API', 'backend'],
        blockers: [`${key}-2`],
        hidden: false,
      },
      [`${key}-2`]: { dueDate: null, parent: null, labels: ['API'], blockers: [], hidden: false },
      // Parent from the id (BACK-2.1 -> BACK-2); 2026-02-30 is not a day.
      [`${key}-2.1`]: { dueDate: null, parent: `${key}-2`, labels: [], blockers: [], hidden: false },
      [`${key}-3`]: { dueDate: null, parent: `${key}-1`, labels: [], blockers: [`${key}-1`], hidden: false },
    });
    expect(await projectLabels(ctx.db, project.id)).toEqual([
      { name: 'API', color: 1, source: 'backlog' },
      { name: 'backend', color: 2, source: 'backlog' },
    ]);
    const source = await ctx.db
      .select({ warnings: schema.backlogSource.warnings })
      .from(schema.backlogSource)
      .where(eq(schema.backlogSource.projectId, project.id));
    expect(JSON.stringify(source[0]?.warnings)).toContain('BACK-99 matches no task in this project');
    expect((await projectActivity(ctx.db, project.id)).map((row) => row.type)).toEqual([
      'project.backlog_imported',
    ]);
  });

  it('changed files write native activity changes; colours stay as the app set them', async () => {
    const repo = repoWithFields();
    const { project, key, sourceId } = await mirror(repo);
    await ctx.db
      .update(schema.label)
      .set({ color: 7 })
      .where(and(eq(schema.label.projectId, project.id), eq(schema.label.name, 'backend')));
    const tasks = await tasksByKey(ctx.db, project.id, key);
    const id = (suffix: string) => tasks.get(`${key}-${suffix}`)?.id as string;
    repo.set(
      taskPath(FOLDER, 'back-1', 'First'),
      taskFile({ id: 'BACK-1', title: 'First', labels: ['Backend', 'payouts'] }),
    );
    repo.set(
      taskPath(FOLDER, 'back-2.1', 'Sub'),
      taskFile({ id: 'BACK-2.1', title: 'Sub', parent: 'BACK-1', due: '2026-12-01' }),
    );
    const commit = repo.commit();
    const outcome = await refreshBacklogSource(ctx, sourceId, 'webhook');
    expect(outcome.result).toMatchObject({ created: 0, updated: 3, hidden: 0 });

    const state = await nativeState(ctx.db, project.id, key);
    expect(state[`${key}-1`]).toEqual({
      dueDate: null,
      parent: null,
      labels: ['backend', 'payouts'],
      blockers: [],
      hidden: false,
    });
    expect(state[`${key}-2.1`]).toMatchObject({ parent: `${key}-1`, dueDate: '2026-12-01' });
    // Unused labels stay; a refresh never changes a colour.
    expect(await projectLabels(ctx.db, project.id)).toEqual([
      { name: 'API', color: 1, source: 'backlog' },
      { name: 'backend', color: 7, source: 'backlog' },
      { name: 'payouts', color: 2, source: 'backlog' },
    ]);
    const labelId = async (name: string) =>
      (
        await ctx.db
          .select({ id: schema.label.id })
          .from(schema.label)
          .where(and(eq(schema.label.projectId, project.id), eq(schema.label.name, name)))
      )[0]?.id;

    const activity = await projectActivity(ctx.db, project.id);
    const updated = activity.filter((row) => row.type === 'task.updated');
    // BACK-2 lost its subtask: its block changed, with no change to show, so it has no row.
    expect(updated.map((row) => row.taskId).sort()).toEqual([id('1'), id('2.1')].sort());
    expect(updated.every((row) => row.origin === 'backlog' && row.originRef === commit && !row.actorId)).toBe(
      true,
    );
    expect(updated.find((row) => row.taskId === id('1'))?.changes).toEqual([
      {
        field: 'labels',
        from: [
          { id: await labelId('API'), name: 'API' },
          { id: await labelId('backend'), name: 'backend' },
        ],
        to: [
          { id: await labelId('backend'), name: 'backend' },
          { id: await labelId('payouts'), name: 'payouts' },
        ],
      },
      { field: 'dueDate', from: '2026-11-20', to: null },
      { field: 'blockedBy', from: [{ id: id('2'), key: `${key}-2`, title: 'Second' }], to: [] },
    ]);
    expect(updated.find((row) => row.taskId === id('2.1'))?.changes).toEqual([
      { field: 'dueDate', from: null, to: '2026-12-01' },
      {
        field: 'parent',
        from: { id: id('2'), key: `${key}-2`, title: 'Second' },
        to: { id: id('1'), key: `${key}-1`, title: 'First' },
      },
    ]);
  });

  it('reuses a project label with the same name ignoring case and locks its name', async () => {
    const repo = repoWithFields();
    const { project, sourceId } = await mirror(repo, { refresh: false });
    await ctx.db.insert(schema.label).values({
      workspaceId: world.workspaceId,
      projectId: project.id,
      name: 'Backend',
      color: 5,
      source: 'app',
    });
    await refreshBacklogSource(ctx, sourceId, 'setup');
    expect(await projectLabels(ctx.db, project.id)).toEqual([
      { name: 'API', color: 1, source: 'backlog' },
      { name: 'Backend', color: 5, source: 'backlog' },
    ]);
  });

  it('detach and imports turn Backlog.md labels into app labels', async () => {
    const mirrored = await mirror(repoWithFields());
    await detachBacklog(ctx, world.ownerActor, { projectKey: mirrored.key, confirmKey: mirrored.key });
    expect((await projectLabels(ctx.db, mirrored.project.id)).map((row) => row.source)).toEqual([
      'app',
      'app',
    ]);
    const imported = await mirror(repoWithFields(), { mode: 'import' });
    expect(await projectLabels(ctx.db, imported.project.id)).toEqual([
      { name: 'API', color: 1, source: 'app' },
      { name: 'backend', color: 2, source: 'app' },
    ]);
    expect((await nativeState(ctx.db, imported.project.id, imported.key))[`${imported.key}-1`]).toMatchObject(
      {
        labels: ['API', 'backend'],
      },
    );
  });

  it('after the backfill migration, a refresh of unchanged files reports no change', async () => {
    const repo = repoWithFields();
    const { project, key, sourceId } = await mirror(repo);
    // BACK-2's file goes: its task is hidden, keeps its labels, and BACK-1 still waits on it.
    repo.remove(taskPath(FOLDER, 'back-2', 'Second'));
    repo.commit();
    await refreshBacklogSource(ctx, sourceId, 'webhook');
    const expected = await nativeState(ctx.db, project.id, key);
    expect(expected[`${key}-2`]).toMatchObject({ hidden: true, labels: ['API'] });
    expect(expected[`${key}-1`]).toMatchObject({ blockers: [`${key}-2`] });
    const labelsBefore = await projectLabels(ctx.db, project.id);

    // A 0.6.0 database had none of these.
    const ids = [...(await tasksByKey(ctx.db, project.id, key)).values()].map((row) => row.id);
    await ctx.db.delete(schema.taskDependency).where(inArray(schema.taskDependency.taskId, ids));
    await ctx.db.delete(schema.label).where(eq(schema.label.projectId, project.id));
    await ctx.db
      .update(schema.task)
      .set({ dueDate: null, parentId: null, updatedAt: sql`${schema.task.updatedAt}` })
      .where(eq(schema.task.projectId, project.id));
    const updatedBefore = (await tasksByKey(ctx.db, project.id, key)).get(`${key}-1`)?.updatedAt;
    const activityBefore = await projectActivity(ctx.db, project.id);

    await ctx.db.execute(sql.raw(readFileSync(join(migrationsFolder, BACKFILL, 'migration.sql'), 'utf8')));
    expect(await nativeState(ctx.db, project.id, key)).toEqual(expected);
    expect(await projectLabels(ctx.db, project.id)).toEqual(labelsBefore);
    expect((await tasksByKey(ctx.db, project.id, key)).get(`${key}-1`)?.updatedAt).toEqual(updatedBefore);
    expect(await projectActivity(ctx.db, project.id)).toHaveLength(activityBefore.length);

    provider.resetCalls();
    const outcome = await refreshBacklogSource(ctx, sourceId, 'manual');
    expect(outcome).toMatchObject({ outcome: 'applied', downloads: 0 });
    expect(outcome.result).toMatchObject({ created: 0, updated: 0, hidden: 0, restored: 0 });
    expect(await projectActivity(ctx.db, project.id)).toHaveLength(activityBefore.length);
    expect(await nativeState(ctx.db, project.id, key)).toEqual(expected);

    // Running it again changes nothing.
    await ctx.db.execute(sql.raw(readFileSync(join(migrationsFolder, BACKFILL, 'migration.sql'), 'utf8')));
    expect(await nativeState(ctx.db, project.id, key)).toEqual(expected);
  });
});
