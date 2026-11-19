import { schema } from '@zamu/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  DELETED_MILESTONE_NAME,
  listTaskActivity,
  loadProjectActivityRows,
  loadTaskActivityRows,
  recordActivities,
  recordActivity,
  toActivities,
  toProjectActivities,
} from './activity';
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

  it('marks app rows with origin app and no commit', async () => {
    const task = await newTask(3);
    await ctx.db.transaction(async (tx) => {
      await recordActivity(tx, world.memberActor, {
        projectId,
        taskId: task.id,
        type: 'task.updated',
        changes: [{ field: 'priority', from: 'none', to: 'high' }],
      });
    });
    const { items } = await listTaskActivity(ctx, world.memberActor, { key: `${projectKey}-3` });
    expect(items[0]).toMatchObject({ origin: 'app', originRef: null, backlogFields: [] });
  });

  it('writes Backlog.md rows without an actor, with the commit and the Backlog.md-only fields', async () => {
    const task = await newTask(4);
    await ctx.db.transaction(async (tx) => {
      await recordActivities(tx, null, [
        {
          workspaceId: world.workspaceId,
          projectId,
          taskId: task.id,
          type: 'task.updated',
          origin: 'backlog',
          originRef: 'a1b2c3d4e5f6',
          changes: [
            { field: 'status', from: 'todo', to: 'in_progress' },
            { field: 'backlog', from: null, to: ['labels', 'dependencies'] },
          ],
        },
        {
          workspaceId: world.workspaceId,
          projectId,
          taskId: task.id,
          type: 'task.hidden',
          origin: 'backlog',
          originRef: 'b2c3d4e5f6a1',
          changes: [],
        },
        {
          workspaceId: world.workspaceId,
          projectId,
          taskId: task.id,
          type: 'task.restored',
          origin: 'backlog',
          originRef: 'c3d4e5f6a1b2',
          changes: [],
        },
      ]);
    });

    const { items } = await listTaskActivity(ctx, world.memberActor, { key: `${projectKey}-4` });
    expect(items.map((item) => [item.type, item.origin, item.originRef])).toEqual([
      ['task.updated', 'backlog', 'a1b2c3d4e5f6'],
      ['task.hidden', 'backlog', 'b2c3d4e5f6a1'],
      ['task.restored', 'backlog', 'c3d4e5f6a1b2'],
    ]);
    expect(items[0]).toMatchObject({
      actor: null,
      onBehalfOf: null,
      changes: [{ field: 'status', from: 'todo', to: 'in_progress' }],
      backlogFields: ['labels', 'dependencies'],
    });

    // A subtask key passes through as given.
    const rows = await loadTaskActivityRows(ctx.db, task.id);
    const mapped = await toActivities(ctx.db, `${projectKey}-4.1`, rows);
    expect(mapped.every((item) => item.taskKey === `${projectKey}-4.1`)).toBe(true);
  });

  it('refuses a Backlog.md row with an actor', async () => {
    const task = await newTask(5);
    await expect(
      ctx.db.transaction(async (tx) => {
        await recordActivity(tx, world.memberActor, {
          projectId,
          taskId: task.id,
          type: 'task.updated',
          origin: 'backlog',
          changes: [],
        });
      }),
    ).rejects.toThrow(/without an actor/);
    expect(await loadTaskActivityRows(ctx.db, task.id)).toEqual([]);
  });

  it('writes and reads project-level rows, which stay out of task activity', async () => {
    const task = await newTask(6);
    await ctx.db.transaction(async (tx) => {
      await recordActivity(tx, null, {
        workspaceId: world.workspaceId,
        projectId,
        type: 'project.backlog_imported',
        origin: 'backlog',
        originRef: 'a1b2c3d4e5f6',
        details: { mode: 'mirror', repository: 'gitlab.com/reddevs/payments', tasks: 412, milestones: 6 },
      });
      await recordActivity(tx, world.ownerActor, {
        projectId,
        type: 'project.backlog_detached',
        details: {},
      });
    });

    const rows = await loadProjectActivityRows(ctx.db, projectId);
    expect(rows.every((row) => row.taskId === null)).toBe(true);
    const entries = await toProjectActivities(ctx.db, rows);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      type: 'project.backlog_imported',
      actor: null,
      origin: 'backlog',
      originRef: 'a1b2c3d4e5f6',
      details: { mode: 'mirror', repository: 'gitlab.com/reddevs/payments', tasks: 412, milestones: 6 },
    });
    expect(entries[1]).toMatchObject({
      type: 'project.backlog_detached',
      actor: { id: world.owner.id },
      origin: 'app',
      originRef: null,
      details: { mode: null, repository: null, tasks: null, milestones: null },
    });
    expect(await loadTaskActivityRows(ctx.db, task.id)).toEqual([]);
  });
});
