import { schema } from '@pm/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DELETED_MILESTONE_NAME, listTaskActivity, recordActivities, recordActivity } from './activity';
import { createWorld, randomProjectKey, type TestContext, testContext, type World } from './testing/fixtures';

// Rows are written directly so this suite covers activity.ts on its own, whatever tasks.ts does.
describe('activity', () => {
  let ctx: TestContext;
  let world: World;
  let projectId: string;
  let projectKey: string;

  beforeAll(async () => {
    ctx = testContext();
    world = await createWorld(ctx.db);
    projectKey = randomProjectKey();
    const [row] = await ctx.db
      .insert(schema.project)
      .values({ workspaceId: world.workspaceId, key: projectKey, name: 'Payments' })
      .returning();
    if (!row) throw new Error('project insert failed');
    projectId = row.id;
  });
  afterAll(async () => {
    await ctx?.close();
  });

  async function newTask(number: number) {
    const [row] = await ctx.db
      .insert(schema.task)
      .values({ projectId, number, title: `Task ${number}`, createdById: world.owner.id })
      .returning();
    if (!row) throw new Error('task insert failed');
    return row;
  }

  async function newCycle(number: number, name: string | null) {
    const day = String(number).padStart(2, '0');
    const [row] = await ctx.db
      .insert(schema.cycle)
      .values({
        workspaceId: world.workspaceId,
        projectId,
        number,
        name,
        startsOn: `2026-01-${day}`,
        endsOn: `2026-01-${day}`,
      })
      .returning();
    if (!row) throw new Error('cycle insert failed');
    return row;
  }

  it('resolves milestone and cycle ids, keeps M1 fields and records the agent behind a change', async () => {
    const task = await newTask(1);
    const [webhooks] = await ctx.db
      .insert(schema.milestone)
      .values({ workspaceId: world.workspaceId, projectId, name: 'Webhooks v2', createdById: world.owner.id })
      .returning();
    const [dropped] = await ctx.db
      .insert(schema.milestone)
      .values({ workspaceId: world.workspaceId, projectId, name: 'Dropped', createdById: world.owner.id })
      .returning();
    if (!webhooks || !dropped) throw new Error('milestone insert failed');
    const c12 = await newCycle(12, 'Checkout rewrite');

    await ctx.db.transaction(async (tx) => {
      await recordActivity(tx, world.agentActor, {
        projectId,
        taskId: task.id,
        type: 'task.updated',
        changes: [
          { field: 'status', from: 'todo', to: 'in_progress' },
          { field: 'assignee', from: null, to: world.agent.id },
          { field: 'milestone', from: dropped.id, to: webhooks.id },
          { field: 'cycle', from: null, to: c12.id },
        ],
      });
    });
    await ctx.db.delete(schema.milestone).where(eq(schema.milestone.id, dropped.id));

    const { items } = await listTaskActivity(ctx, world.ownerActor, { key: `${projectKey}-1` });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      type: 'task.updated',
      taskKey: `${projectKey}-1`,
      actor: { id: world.agent.id, kind: 'agent' },
      onBehalfOf: { id: world.member.id, kind: 'person' },
      changes: [
        { field: 'status', from: 'todo', to: 'in_progress' },
        { field: 'assignee', from: null, to: { id: world.agent.id, kind: 'agent' } },
        {
          field: 'milestone',
          from: { id: dropped.id, name: DELETED_MILESTONE_NAME },
          to: { id: webhooks.id, name: 'Webhooks v2' },
        },
        { field: 'cycle', from: null, to: { id: c12.id, number: 12, name: 'Checkout rewrite' } },
      ],
    });
  });

  it('records system entries with a null actor, in order', async () => {
    const task = await newTask(2);
    const c13 = await newCycle(13, null);
    const c14 = await newCycle(14, 'Polish');

    await ctx.db.transaction(async (tx) => {
      await recordActivity(tx, world.memberActor, {
        projectId,
        taskId: task.id,
        type: 'task.created',
        changes: [{ field: 'title', from: null, to: 'Task 2' }],
      });
      await recordActivities(tx, null, [
        {
          workspaceId: world.workspaceId,
          projectId,
          taskId: task.id,
          type: 'cycle.ended',
          changes: [{ field: 'cycle', from: c13.id, to: c14.id }],
        },
      ]);
      await recordActivities(tx, world.memberActor, []);
    });

    const { items } = await listTaskActivity(ctx, world.memberActor, { key: `${projectKey}-2` });
    expect(items.map((item) => item.type)).toEqual(['task.created', 'cycle.ended']);
    expect(items[1]).toMatchObject({
      actor: null,
      onBehalfOf: null,
      changes: [
        {
          field: 'cycle',
          from: { id: c13.id, number: 13, name: null },
          to: { id: c14.id, number: 14, name: 'Polish' },
        },
      ],
    });
  });
});
