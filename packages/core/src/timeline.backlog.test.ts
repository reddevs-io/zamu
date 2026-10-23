// M3: timelines of mirrored tasks: suffixed keys, Backlog.md ids, and entries a refresh wrote.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { recordActivity } from './activity';
import { createComment } from './comments';
import { createMirroredProject, type MirroredProject } from './testing/backlog';
import { createWorld, type TestContext, testContext, type World } from './testing/fixtures';
import { listTaskTimeline } from './timeline';

describe('timeline of a mirrored task', () => {
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

  it('shows Backlog.md entries with origin, commit and no actor next to comments', async () => {
    const { subtask } = mirror.tasks;
    await ctx.db.transaction(async (tx) => {
      await recordActivity(tx, null, {
        workspaceId: world.workspaceId,
        projectId: mirror.project.id,
        taskId: subtask.id,
        type: 'task.updated',
        origin: 'backlog',
        originRef: 'b2c3d4e',
        changes: [
          { field: 'status', from: 'todo', to: 'in_progress' },
          { field: 'backlog', from: null, to: ['labels'] },
        ],
      });
      await recordActivity(tx, null, {
        workspaceId: world.workspaceId,
        projectId: mirror.project.id,
        taskId: subtask.id,
        type: 'task.hidden',
        origin: 'backlog',
        originRef: 'c3d4e5f',
        changes: [],
      });
    });
    await createComment(ctx, world.agentActor, { key: 'BACK-786.1', body: 'Picked this up' });

    const byKey = await listTaskTimeline(ctx, world.memberActor, { key: `${mirror.key}-786.1` });
    const byBacklogId = await listTaskTimeline(ctx, world.memberActor, {
      key: 'back-786.1',
      project: mirror.key,
    });
    expect(byBacklogId).toEqual(byKey);
    expect(byKey.items.map((item) => [item.kind, item.taskKey])).toEqual([
      ['activity', `${mirror.key}-786.1`],
      ['activity', `${mirror.key}-786.1`],
      ['comment', expect.any(String)],
    ]);
    expect(byKey.items[0]).toMatchObject({
      kind: 'activity',
      type: 'task.updated',
      actor: null,
      origin: 'backlog',
      originRef: 'b2c3d4e',
      changes: [{ field: 'status', from: 'todo', to: 'in_progress' }],
      backlogFields: ['labels'],
    });
    expect(byKey.items[1]).toMatchObject({ type: 'task.hidden', actor: null, origin: 'backlog' });
    expect(byKey.items[2]).toMatchObject({ kind: 'comment', author: { id: world.agent.id } });
  });

  it('keeps the timeline of hidden tasks', async () => {
    const timeline = await listTaskTimeline(ctx, world.memberActor, { key: 'BACK-12' });
    expect(timeline.items).toEqual([]);
  });
});
