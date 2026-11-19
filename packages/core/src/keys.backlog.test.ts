// M3: suffixed task keys and hidden tasks outside tasks.ts: comments, task activity and cycles.
import { schema } from '@zamu/db';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { listTaskActivity } from './activity';
import { createComment, listComments } from './comments';
import { createCycle, getCycle } from './cycles';
import { createProject } from './projects';
import { createTask } from './tasks';
import { createBacklogSourceRow, createMirroredProject, type MirroredProject } from './testing/backlog';
import { createWorld, type TestContext, testContext, type World } from './testing/fixtures';

describe('suffixed keys and hidden tasks outside the task service', () => {
  let ctx: TestContext;
  let world: World;
  let mirror: MirroredProject;

  beforeAll(async () => {
    ctx = testContext();
    world = await createWorld(ctx.db);
    mirror = await createMirroredProject(ctx.db, world);
  });
  afterAll(async () => {
    await ctx?.close();
  });

  it('keeps the suffix on comment task keys, by app key and by Backlog.md id', async () => {
    const created = await createComment(ctx, world.memberActor, {
      key: 'back-786.1',
      project: mirror.key,
      body: 'Looks good',
    });
    expect(created.taskKey).toBe(`${mirror.key}-786.1`);
    const listed = await listComments(ctx, world.memberActor, { key: `${mirror.key}-786.1` });
    expect(listed.items.map((item) => item.taskKey)).toEqual([`${mirror.key}-786.1`]);
  });

  it('finds task activity by Backlog.md id narrowed to the project', async () => {
    const byId = await listTaskActivity(ctx, world.memberActor, { key: 'BACK-786.1.2', project: mirror.key });
    const byKey = await listTaskActivity(ctx, world.memberActor, { key: `${mirror.key}-786.1.2` });
    expect(byId).toEqual(byKey);
  });

  it('leaves hidden tasks out of cycle counts', async () => {
    const cycle = await createCycle(ctx, world.ownerActor, { project: mirror.key });
    const { parent, hidden } = mirror.tasks;
    await ctx.db
      .update(schema.task)
      .set({ cycleId: cycle.id, cycleAddedAt: new Date() })
      .where(inArray(schema.task.id, [parent.id, hidden.id]));
    const detail = await getCycle(ctx, world.memberActor, { project: mirror.key, number: cycle.number });
    expect(detail.counts.total).toBe(1);
    await ctx.db.update(schema.task).set({ cycleId: null }).where(eq(schema.task.cycleId, cycle.id));
  });

  it('refuses new tasks while an import has not finished its first read', async () => {
    const project = await createProject(ctx, world.ownerActor, { name: 'Import target', key: 'IMPT' });
    await createBacklogSourceRow(ctx.db, project.id, {
      createdById: world.owner.id,
      mode: 'import',
      state: 'setup',
    });
    await expect(
      createTask(ctx, world.ownerActor, { project: 'IMPT', title: 'Too early' }),
    ).rejects.toMatchObject({
      code: 'PROJECT_MIRRORED',
    });
  });
});
