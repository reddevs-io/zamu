// M5 relations: blockers with the loop check, parents and subtasks one level deep, and the
// fields a task view shows for them.
import { schema } from '@pm/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { listTaskActivity } from './activity';
import { Invalid, mirroredExtensions, TaskMirrored } from './errors';
import { createProject } from './projects';
import { DependencyLoop, NotSameProject, problemCodeOf, SubtaskDepth } from './relations';
import { createTask, getTask, listTasks, updateTask } from './tasks';
import { createMirroredProject, type MirroredProject } from './testing/backlog';
import {
  addTaskBlockers,
  createWorld,
  randomProjectKey,
  type TestContext,
  testContext,
  type World,
} from './testing/fixtures';

async function rejection<T extends Error>(
  promise: Promise<unknown>,
  type: new (...args: never[]) => T,
): Promise<T> {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(type);
  return error as T;
}

describe('task relations', () => {
  let ctx: TestContext;
  let world: World;
  let key: string;
  let otherKey: string;

  beforeAll(async () => {
    ctx = testContext();
    world = await createWorld(ctx.db);
    key = randomProjectKey();
    otherKey = randomProjectKey();
    await createProject(ctx, world.ownerActor, { name: 'Relations', key });
    await createProject(ctx, world.ownerActor, { name: 'Elsewhere', key: otherKey });
  });
  afterAll(async () => {
    await ctx?.close();
  });

  const newTask = (title: string, values: Record<string, unknown> = {}) =>
    createTask(ctx, world.memberActor, { project: key, title, ...values });

  describe('blockers', () => {
    it('adds and removes blockers, shows both directions and the blocked marker', async () => {
      const a = await newTask('Waits');
      const b = await newTask('Blocker one');
      const c = await newTask('Blocker two', { status: 'done' });
      const updated = await updateTask(ctx, world.memberActor, { key: a.key, addBlockers: [c.key, b.key] });
      expect(updated.blockedBy?.map((item) => item?.key)).toEqual([b.key, c.key]);
      expect(updated.blocked).toBe(true);
      await expect(getTask(ctx, world.memberActor, { key: b.key })).resolves.toMatchObject({
        blocks: [{ key: a.key, title: 'Waits', status: 'todo', assignee: null }],
        blockedBy: [],
        blocked: false,
      });

      // Only Done and Canceled blockers left: not blocked.
      const rest = await updateTask(ctx, world.memberActor, {
        key: a.key,
        removeBlockers: [b.key, 'NOPE-1'],
      });
      expect(rest.blockedBy?.map((item) => item?.key)).toEqual([c.key]);
      expect(rest.blocked).toBe(false);

      const activity = await listTaskActivity(ctx, world.memberActor, { key: a.key });
      expect(activity.items.map((item) => item.changes)).toEqual([
        [{ field: 'title', from: null, to: 'Waits' }],
        [
          {
            field: 'blockedBy',
            from: [],
            to: [
              { key: b.key, title: 'Blocker one', removed: false },
              { key: c.key, title: 'Blocker two', removed: false },
            ],
          },
        ],
        [
          {
            field: 'blockedBy',
            from: [
              { key: b.key, title: 'Blocker one', removed: false },
              { key: c.key, title: 'Blocker two', removed: false },
            ],
            to: [{ key: c.key, title: 'Blocker two', removed: false }],
          },
        ],
      ]);
      // Adding a blocker again or removing one that isn't there changes nothing.
      await updateTask(ctx, world.memberActor, { key: a.key, addBlockers: [c.key], removeBlockers: [b.key] });
      expect((await listTaskActivity(ctx, world.memberActor, { key: a.key })).items).toHaveLength(3);
    });

    it('creates tasks with blockers and records them', async () => {
      const blocker = await newTask('First');
      const task = await newTask('Second', { blockedBy: [blocker.key] });
      expect(task.blockedBy).toEqual([{ key: blocker.key, title: 'First', status: 'todo', assignee: null }]);
      expect(task.blocked).toBe(true);
      const [created] = (await listTaskActivity(ctx, world.memberActor, { key: task.key })).items;
      expect(created?.changes).toContainEqual({
        field: 'blockedBy',
        from: [],
        to: [{ key: blocker.key, title: 'First', removed: false }],
      });
    });

    it('refuses direct and indirect loops with the sentence and both ends', async () => {
      const a = await newTask('A');
      const b = await newTask('B', { blockedBy: [a.key] });
      const c = await newTask('C', { blockedBy: [b.key] });
      // a waits on c would close c -> b -> a -> c.
      const loop = await rejection(
        updateTask(ctx, world.memberActor, { key: a.key, addBlockers: [c.key] }),
        DependencyLoop,
      );
      expect(problemCodeOf(loop)).toBe('DEPENDENCY_LOOP');
      expect(loop.message).toBe(`Can't add: ${c.key} already waits on ${a.key}.`);
      expect(loop.loop).toEqual({ task: a.key, blocker: c.key });
      expect(loop.issues).toEqual([{ path: 'addBlockers', message: loop.message }]);
      await expect(updateTask(ctx, world.memberActor, { key: a.key, addBlockers: [b.key] })).rejects.toThrow(
        DependencyLoop,
      );
      // Nothing was written.
      await expect(getTask(ctx, world.memberActor, { key: a.key })).resolves.toMatchObject({ blockedBy: [] });
      // Removing the middle link in the same write opens the way.
      const fixed = await updateTask(ctx, world.memberActor, {
        key: b.key,
        removeBlockers: [a.key],
      });
      expect(fixed.blockedBy).toEqual([]);
      await expect(
        updateTask(ctx, world.memberActor, { key: a.key, addBlockers: [c.key] }),
      ).resolves.toMatchObject({
        blocked: true,
      });
    });

    it('refuses itself, other projects and unknown keys', async () => {
      const a = await newTask('Alone');
      const self = await rejection(
        updateTask(ctx, world.memberActor, { key: a.key, addBlockers: [a.key] }),
        Invalid,
      );
      expect(self.issues?.[0]?.path).toBe('addBlockers');
      const theirs = await createTask(ctx, world.memberActor, { project: otherKey, title: 'Theirs' });
      const cross = await rejection(
        updateTask(ctx, world.memberActor, { key: a.key, addBlockers: [theirs.key] }),
        NotSameProject,
      );
      expect(problemCodeOf(cross)).toBe('NOT_SAME_PROJECT');
      await expect(newTask('Cross', { blockedBy: [theirs.key] })).rejects.toThrow(NotSameProject);
      await expect(
        updateTask(ctx, world.memberActor, { key: a.key, addBlockers: [`${key}-99999`] }),
      ).rejects.toThrow(Invalid);
    });

    it('walks an existing loop (from Backlog.md files) without hanging', async () => {
      const x = await newTask('Loop X');
      const y = await newTask('Loop Y');
      // Raw links: x and y wait on each other, as a mirrored file can say.
      await addTaskBlockers(ctx.db, x.id, [y.id]);
      await addTaskBlockers(ctx.db, y.id, [x.id]);
      const w = await newTask('Outside the loop');
      // The walk from x goes round x -> y -> x; it ends and finds no path back to w.
      await expect(
        updateTask(ctx, world.memberActor, { key: w.key, addBlockers: [x.key] }),
      ).resolves.toMatchObject({
        blockedBy: [{ key: x.key }],
      });
      // A link into the loop from inside it is still refused.
      const z = await newTask('Z', { blockedBy: [y.key] });
      await expect(updateTask(ctx, world.memberActor, { key: x.key, addBlockers: [z.key] })).rejects.toThrow(
        DependencyLoop,
      );
    });

    it('lets only one of two links added at once close a loop', async () => {
      for (let round = 0; round < 5; round++) {
        const a = await newTask(`Race A ${round}`);
        const b = await newTask(`Race B ${round}`);
        const results = await Promise.allSettled([
          updateTask(ctx, world.memberActor, { key: a.key, addBlockers: [b.key] }),
          updateTask(ctx, world.agentActor, { key: b.key, addBlockers: [a.key] }),
        ]);
        expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
        const failed = results.find((result) => result.status === 'rejected');
        expect((failed as PromiseRejectedResult).reason).toBeInstanceOf(DependencyLoop);
      }
    });
  });

  describe('subtasks', () => {
    it('creates a subtask with the parent assignee unless one is given', async () => {
      const parent = await newTask('Parent', { assignee: world.agent.id });
      const child = await newTask('Child', { parent: parent.key });
      expect(child.parent).toEqual({
        key: parent.key,
        title: 'Parent',
        status: 'todo',
        assignee: { id: world.agent.id, name: world.agent.name, kind: 'agent' },
      });
      expect(child.assignee?.id).toBe(world.agent.id);
      const mine = await newTask('Mine', { parent: parent.key, assignee: 'me' });
      expect(mine.assignee?.id).toBe(world.member.id);
      const nobody = await newTask('Nobody', { parent: parent.key, assignee: null });
      expect(nobody.assignee).toBeNull();
      const [created] = (await listTaskActivity(ctx, world.memberActor, { key: child.key })).items;
      expect(created?.changes).toContainEqual({
        field: 'parent',
        from: null,
        to: { key: parent.key, title: 'Parent', removed: false },
      });
    });

    it('shows subtasks by key with progress that leaves canceled and hidden ones out', async () => {
      const parent = await newTask('Progress');
      const done = await newTask('Done one', { parent: parent.key, status: 'done' });
      await newTask('Open one', { parent: parent.key });
      const canceled = await newTask('Canceled one', { parent: parent.key, status: 'canceled' });
      const view = await getTask(ctx, world.memberActor, { key: parent.key });
      expect(view.subtasks?.map((item) => item.key)).toHaveLength(3);
      expect(view.subtasks?.[0]?.key).toBe(done.key);
      expect(view.subtasks?.map((item) => item.status)).toContain('canceled');
      expect(view.subtaskProgress).toEqual({ done: 1, total: 2 });
      const page = await listTasks(ctx, world.memberActor, { project: key, q: 'Progress' });
      expect(page.items.find((item) => item.key === parent.key)).toMatchObject({
        subtaskProgress: { done: 1, total: 2 },
        parentKey: null,
      });
      const subtasks = await listTasks(ctx, world.memberActor, { project: key, parent: parent.key });
      expect(subtasks.items.map((item) => item.parentKey)).toEqual([parent.key, parent.key, parent.key]);
      expect(subtasks.items.map((item) => item.key)).toContain(canceled.key);
    });

    it('goes one level deep, in the same project', async () => {
      const top = await newTask('Top');
      const child = await newTask('Under top', { parent: top.key });
      const deeper = await rejection(newTask('Too deep', { parent: child.key }), SubtaskDepth);
      expect(problemCodeOf(deeper)).toBe('SUBTASK_DEPTH');
      const loose = await newTask('Loose');
      await expect(updateTask(ctx, world.memberActor, { key: loose.key, parent: child.key })).rejects.toThrow(
        SubtaskDepth,
      );
      // A task with subtasks can't become one.
      const other = await newTask('Other top');
      const nested = await rejection(
        updateTask(ctx, world.memberActor, { key: top.key, parent: other.key }),
        SubtaskDepth,
      );
      expect(nested.message).toContain('has subtasks');
      await expect(updateTask(ctx, world.memberActor, { key: top.key, parent: top.key })).rejects.toThrow(
        Invalid,
      );
      const theirs = await createTask(ctx, world.memberActor, { project: otherKey, title: 'Their parent' });
      await expect(
        updateTask(ctx, world.memberActor, { key: loose.key, parent: theirs.key }),
      ).rejects.toThrow(NotSameProject);
    });

    it('moves and clears the parent and records both ends', async () => {
      const first = await newTask('First parent');
      const second = await newTask('Second parent');
      const child = await newTask('Moving child', { parent: first.key });
      const moved = await updateTask(ctx, world.memberActor, { key: child.key, parent: second.key });
      expect(moved.parent?.key).toBe(second.key);
      const cleared = await updateTask(ctx, world.memberActor, { key: child.key, parent: null });
      expect(cleared.parent).toBeNull();
      // Same value again: no change.
      await updateTask(ctx, world.memberActor, { key: child.key, parent: null });
      const items = (await listTaskActivity(ctx, world.memberActor, { key: child.key })).items;
      expect(items.slice(1).map((item) => item.changes)).toEqual([
        [
          {
            field: 'parent',
            from: { key: first.key, title: 'First parent', removed: false },
            to: { key: second.key, title: 'Second parent', removed: false },
          },
        ],
        [{ field: 'parent', from: { key: second.key, title: 'Second parent', removed: false }, to: null }],
      ]);
    });
  });

  describe('hidden tasks', () => {
    it('reads hidden blockers as removed and does not count them as blocking', async () => {
      const blocker = await newTask('Soon hidden');
      const waiting = await newTask('Waits on hidden', { blockedBy: [blocker.key] });
      await ctx.db.update(schema.task).set({ hiddenAt: new Date() }).where(eq(schema.task.id, blocker.id));
      const view = await getTask(ctx, world.memberActor, { key: waiting.key });
      expect(view.blockedBy).toEqual([null]);
      expect(view.blocked).toBe(false);
      const activity = await listTaskActivity(ctx, world.memberActor, { key: waiting.key });
      expect(activity.items[0]?.changes).toContainEqual({
        field: 'blockedBy',
        from: [],
        to: [{ key: blocker.key, title: 'Soon hidden', removed: true }],
      });
    });
  });

  describe('mirrored tasks', () => {
    let mirror: MirroredProject;
    beforeAll(async () => {
      mirror = await createMirroredProject(ctx.db, world);
      await addTaskBlockers(ctx.db, mirror.tasks.subtask.id, [mirror.tasks.draft.id]);
    });

    it('refuses the new fields with a backlog task edit hint', async () => {
      const ref = `${mirror.key}-786.1`;
      const hint = async (input: Record<string, unknown>) => {
        const error = await rejection(
          updateTask(ctx, world.memberActor, { key: ref, ...input }),
          TaskMirrored,
        );
        return { field: mirroredExtensions(error)?.field, hint: mirroredExtensions(error)?.hint };
      };
      await expect(hint({ labels: ['api', 'backend'] })).resolves.toEqual({
        field: 'labels',
        hint: 'backlog task edit 786.1 -l api,backend',
      });
      await expect(hint({ addLabels: ['ops'] })).resolves.toEqual({
        field: 'labels',
        hint: 'backlog task edit 786.1 -l ops',
      });
      await expect(hint({ dueDate: '2026-12-01' })).resolves.toEqual({
        field: 'dueDate',
        hint: 'backlog task edit 786.1 --due-date 2026-12-01',
      });
      await expect(hint({ addBlockers: [`${mirror.key}-786`] })).resolves.toEqual({
        field: 'blockedBy',
        hint: 'backlog task edit 786.1 --dep DRAFT-3,BACK-786',
      });
      await expect(hint({ removeBlockers: [`${mirror.key}-787`] })).resolves.toEqual({
        field: 'blockedBy',
        hint: 'backlog task edit 786.1 --clear-deps',
      });
      await expect(hint({ parent: `${mirror.key}-787` })).resolves.toEqual({
        field: 'parent',
        hint: 'Change parent_task_id in the task file and push',
      });
      // No change: nothing to refuse.
      await expect(
        updateTask(ctx, world.memberActor, { key: ref, removeLabels: ['nothing'] }),
      ).resolves.toMatchObject({
        key: ref,
      });
    });
  });
});
