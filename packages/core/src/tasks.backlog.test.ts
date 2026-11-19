// M3: tasks of projects mirrored from Backlog.md: suffixed keys, Backlog.md id lookups, the
// Backlog.md block, hidden tasks and owned-field locks.
import { TASK_OWNED_FIELDS } from '@zamu/contracts';
import { schema } from '@zamu/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createComment } from './comments';
import { Forbidden, Invalid, mirroredExtensions, NotFound, ProjectMirrored, TaskMirrored } from './errors';
import { createTask, getTask, listTasks, updateTask } from './tasks';
import { createMirroredProject, createMirroredTaskRow, type MirroredProject } from './testing/backlog';
import {
  createCycleRow,
  createWorld,
  keyActor,
  type TestContext,
  testContext,
  type World,
} from './testing/fixtures';

/** Runs `promise`, expecting it to reject with `type`, and returns the error. */
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

describe('tasks in a project mirrored from Backlog.md', () => {
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

  describe('lookups', () => {
    it('finds tasks by suffixed key, nested suffix and Backlog.md id in any case', async () => {
      const { key } = mirror;
      const parent = await getTask(ctx, world.memberActor, { key: `${key}-786` });
      expect(parent).toMatchObject({ key: `${key}-786`, number: 786, title: mirror.tasks.parent.title });

      const sub = await getTask(ctx, world.memberActor, { key: `${key.toLowerCase()}-786.1` });
      expect(sub).toMatchObject({ id: mirror.tasks.subtask.id, key: `${key}-786.1`, number: 786 });
      const nested = await getTask(ctx, world.memberActor, { key: `${key}-786.1.2` });
      expect(nested).toMatchObject({ id: mirror.tasks.nested.id, key: `${key}-786.1.2` });

      for (const ref of ['BACK-786.1', 'back-786.1', 'back-0786.01', ' BACK-786.1 ']) {
        await expect(getTask(ctx, world.memberActor, { key: ref })).resolves.toMatchObject({
          id: mirror.tasks.subtask.id,
        });
      }
      await expect(getTask(ctx, world.memberActor, { key: 'draft-3' })).resolves.toMatchObject({
        id: mirror.tasks.draft.id,
        key: `${key}-787`,
      });
    });

    it('answers NotFound for unknown suffixes and Backlog.md ids, Invalid for garbage', async () => {
      const { key } = mirror;
      await expect(getTask(ctx, world.memberActor, { key: `${key}-786.9` })).rejects.toThrow(NotFound);
      await expect(getTask(ctx, world.memberActor, { key: `${key}-786.1.2.3` })).rejects.toThrow(NotFound);
      await expect(getTask(ctx, world.memberActor, { key: 'BACK-4242' })).rejects.toThrow(NotFound);
      await expect(getTask(ctx, world.memberActor, { key: 'not a key' })).rejects.toThrow(Invalid);
    });

    it('finds hidden tasks by key and Backlog.md id', async () => {
      const task = await getTask(ctx, world.memberActor, { key: 'BACK-12' });
      expect(task).toMatchObject({ id: mirror.tasks.hidden.id, key: `${mirror.key}-12`, hidden: true });
      expect(task.hiddenAt).not.toBeNull();
      expect(task.backlog).toMatchObject({ id: 'BACK-12', file: null });
    });

    it('asks for the project when a Backlog.md id is in several projects, and narrows with it', async () => {
      const w = await createWorld(ctx.db);
      const a = await createMirroredProject(ctx.db, w);
      const b = await createMirroredProject(ctx.db, w);
      const error = await rejection(getTask(ctx, w.memberActor, { key: 'BACK-786' }), Invalid);
      expect(error.message).toContain('several projects');
      expect(error.issues?.[0]?.path).toBe('project');
      await expect(getTask(ctx, w.memberActor, { key: 'BACK-786', project: b.key })).resolves.toMatchObject({
        id: b.tasks.parent.id,
      });
      await expect(
        getTask(ctx, w.memberActor, { key: 'back-786.1', project: a.key.toLowerCase() }),
      ).resolves.toMatchObject({ id: a.tasks.subtask.id });
      // A key scoped to one project sees only that one.
      const scoped = keyActor(w, { projects: [a.project.id], access: 'read' });
      await expect(getTask(ctx, scoped, { key: 'BACK-786' })).resolves.toMatchObject({
        id: a.tasks.parent.id,
      });
    });

    it('prefers the Backlog.md id in the named project over an app key of another project', async () => {
      const w = await createWorld(ctx.db);
      const mirrored = await createMirroredProject(ctx.db, w);
      // A native project whose key equals the Backlog.md prefix, with a task numbered 786.
      const back = await createMirroredProject(ctx.db, w, { key: 'BACK', state: 'detached' });
      await expect(getTask(ctx, w.memberActor, { key: 'BACK-786' })).resolves.toMatchObject({
        id: back.tasks.parent.id,
      });
      await expect(
        getTask(ctx, w.memberActor, { key: 'BACK-786', project: mirrored.key }),
      ).resolves.toMatchObject({
        id: mirrored.tasks.parent.id,
      });
      // The app key still answers when the named project has no such Backlog.md id.
      const other = await createMirroredProject(ctx.db, w);
      await expect(
        getTask(ctx, w.memberActor, { key: 'BACK-787', project: other.key }),
      ).resolves.toMatchObject({
        id: back.tasks.draft.id,
      });
    });

    it('refuses Backlog.md ids outside the API key scope', async () => {
      const scoped = keyActor(world, { projects: [], access: 'read' });
      await expect(getTask(ctx, scoped, { key: 'BACK-786' })).rejects.toThrow(Forbidden);
      await expect(getTask(ctx, scoped, { key: `${mirror.key}-786.1` })).rejects.toThrow(Forbidden);
    });
  });

  describe('shapes', () => {
    it('carries the Backlog.md block with links resolved, the file, the locks and hidden', async () => {
      const ghCtx = { ...ctx, gitHosts: { allowPrivate: false, httpHosts: [] } };
      const task = await getTask(ghCtx, world.memberActor, { key: 'BACK-786' });
      expect(task.locked).toEqual([...TASK_OWNED_FIELDS]);
      expect(task.hidden).toBe(false);
      expect(task.hiddenAt).toBeNull();
      const repoPath = (mirror.project.repository as string).replace('https://gitlab.com/', '');
      expect(task.backlog).toMatchObject({
        id: 'BACK-786',
        file: mirror.files.parent,
        fileUrl: `https://gitlab.com/${repoPath}/-/blob/main/backlog/tasks/back-786%20-%20Retry-failed-webhook-deliveries.md`,
        data: {
          kind: 'task',
          status: 'In Progress',
          labels: ['webhooks', 'reliability'],
          createdDate: '2026-10-21 14:26',
          assignees: [
            { value: '@ana', user: { id: world.owner.id } },
            { value: '@ghost', user: null },
          ],
          dependencies: [
            { id: 'BACK-12', task: { key: `${mirror.key}-12`, status: 'done', hidden: true } },
            { id: 'BACK-999', task: null },
          ],
          parent: null,
          subtasks: [
            { id: 'BACK-786.1', task: { key: `${mirror.key}-786.1`, status: 'todo', hidden: false } },
          ],
        },
      });

      const nested = await getTask(ctx, world.memberActor, { key: 'BACK-786.1.2' });
      expect(nested.backlog?.data.parent).toEqual({
        id: 'BACK-786.1',
        task: {
          key: `${mirror.key}-786.1`,
          title: mirror.tasks.subtask.title,
          status: 'todo',
          hidden: false,
        },
      });
    });

    it('leaves native tasks without a Backlog.md block or locks', async () => {
      const w = await createWorld(ctx.db);
      const { createProject } = await import('./projects');
      await createProject(ctx, w.ownerActor, { name: 'Native', key: 'NAT' });
      const task = await createTask(ctx, w.memberActor, { project: 'NAT', title: 'Plain' });
      expect(task).toMatchObject({ backlog: null, locked: [], hidden: false, hiddenAt: null });
      const page = await listTasks(ctx, w.memberActor, { project: 'NAT' });
      expect(page.items[0]).toMatchObject({ backlogId: null, locked: [], hidden: false, commentCount: 0 });
    });
  });

  describe('lists', () => {
    it('leaves hidden tasks out of pages and counts unless asked', async () => {
      const page = await listTasks(ctx, world.memberActor, { project: mirror.key });
      const keys = page.items.map((item) => item.key).sort();
      expect(keys).toEqual([
        `${mirror.key}-786`,
        `${mirror.key}-786.1`,
        `${mirror.key}-786.1.2`,
        `${mirror.key}-787`,
      ]);
      expect(page.counts.done).toBe(0);

      const only = await listTasks(ctx, world.memberActor, { project: mirror.key, hidden: 'only' });
      expect(only.items.map((item) => item.key)).toEqual([`${mirror.key}-12`]);
      expect(only.items[0]).toMatchObject({ hidden: true, backlogId: 'BACK-12' });
      expect(only.counts.done).toBe(1);

      const all = await listTasks(ctx, world.memberActor, { project: mirror.key, hidden: 'include' });
      expect(all.items).toHaveLength(5);

      // Across projects and in My tasks (assignee=me) too.
      const mine = await listTasks(ctx, world.ownerActor, { assignee: 'me', hidden: 'include' });
      expect(mine.items.map((item) => item.key)).toEqual([`${mirror.key}-786`]);
      await ctx.db
        .update(schema.task)
        .set({ assigneeId: world.owner.id })
        .where(eq(schema.task.id, mirror.tasks.hidden.id));
      const mineVisible = await listTasks(ctx, world.ownerActor, { assignee: 'me' });
      expect(mineVisible.items.map((item) => item.key)).toEqual([`${mirror.key}-786`]);
    });

    it('carries keys with suffixes, Backlog.md ids, locks and live comment counts', async () => {
      await createComment(ctx, world.memberActor, { key: `${mirror.key}-786.1`, body: 'On the subtask' });
      const page = await listTasks(ctx, world.memberActor, { project: mirror.key, order: 'board' });
      const sub = page.items.find((item) => item.id === mirror.tasks.subtask.id);
      expect(sub).toMatchObject({
        key: `${mirror.key}-786.1`,
        backlogId: 'BACK-786.1',
        locked: [...TASK_OWNED_FIELDS],
        hidden: false,
        hiddenAt: null,
        commentCount: 1,
      });
    });

    it('searches by suffixed key and Backlog.md id', async () => {
      const byKey = await listTasks(ctx, world.memberActor, {
        project: mirror.key,
        q: `${mirror.key}-786.1.2`,
      });
      expect(byKey.items.map((item) => item.id)).toEqual([mirror.tasks.nested.id]);
      const byBacklogId = await listTasks(ctx, world.memberActor, { project: mirror.key, q: 'back-786.1' });
      expect(byBacklogId.items.map((item) => item.id).sort()).toEqual(
        [mirror.tasks.subtask.id, mirror.tasks.nested.id].sort(),
      );
      const draft = await listTasks(ctx, world.memberActor, { project: mirror.key, q: 'draft-3' });
      expect(draft.items.map((item) => item.id)).toEqual([mirror.tasks.draft.id]);
    });
  });

  describe('locks', () => {
    it('refuses owned-field changes for people and agents with field, file, Backlog.md id and hint', async () => {
      const { key } = mirror;
      for (const actor of [world.memberActor, world.ownerActor, world.agentActor]) {
        const error = await rejection(
          updateTask(ctx, actor, { key: `${key}-786`, status: 'done' }),
          TaskMirrored,
        );
        expect(error.code).toBe('TASK_MIRRORED');
        expect(error.message).toBe(`${key}-786 is mirrored from Backlog.md, so its status can't change here`);
        expect(mirroredExtensions(error)).toEqual({
          field: 'status',
          file: mirror.files.parent,
          backlogId: 'BACK-786',
          hint: 'backlog task edit 786 -s Done',
        });
      }
      const unchanged = await getTask(ctx, world.memberActor, { key: `${key}-786` });
      expect(unchanged.status).toBe('in_progress');
    });

    it('builds a backlog task edit hint for each owned field', async () => {
      const { key } = mirror;
      const hint = async (input: Record<string, unknown>, ref = `${key}-786.1`) => {
        const error = await rejection(
          updateTask(ctx, world.memberActor, { key: ref, ...input }),
          TaskMirrored,
        );
        return { field: error.extensions.field, hint: error.extensions.hint, message: error.message };
      };
      await expect(hint({ status: 'in_progress' })).resolves.toEqual({
        field: 'status',
        hint: 'backlog task edit 786.1 -s "In Progress"',
        message: `${key}-786.1 is mirrored from Backlog.md, so its status can't change here`,
      });
      await expect(hint({ status: 'in_review' })).resolves.toMatchObject({
        hint: 'backlog task edit 786.1 -s "In review"',
      });
      await expect(hint({ title: 'Say "hi" for $5' })).resolves.toMatchObject({
        field: 'title',
        hint: 'backlog task edit 786.1 -t "Say \\"hi\\" for \\$5"',
      });
      await expect(hint({ description: 'Short' })).resolves.toMatchObject({
        field: 'description',
        hint: 'backlog task edit 786.1 -d Short',
      });
      await expect(hint({ priority: 'high' })).resolves.toMatchObject({
        field: 'priority',
        hint: 'backlog task edit 786.1 --priority high',
      });
      await expect(hint({ priority: 'urgent' })).resolves.toMatchObject({
        hint: 'backlog task edit 786.1 --priority urgent',
      });
      await expect(hint({ assignee: world.agent.id })).resolves.toMatchObject({
        field: 'assignee',
        hint: 'backlog task edit 786.1 -a @claude',
      });
      await expect(hint({ assignee: null }, `${key}-786`)).resolves.toMatchObject({
        hint: 'backlog task edit 786 -a ""',
      });
      await expect(hint({ milestone: mirror.milestone.id })).resolves.toMatchObject({
        field: 'milestone',
        hint: 'backlog task edit 786.1 -m m-1',
      });
      await expect(hint({ milestone: null }, `${key}-786`)).resolves.toMatchObject({
        hint: 'backlog task edit 786 --clear-milestone',
      });
      // Drafts are edited with backlog draft edit; Backlog.md ids work as keys.
      await expect(hint({ status: 'done' }, 'DRAFT-3')).resolves.toMatchObject({
        hint: 'backlog draft edit 3 -s Done',
        message: `${key}-787 is mirrored from Backlog.md, so its status can't change here`,
      });
      // Several owned fields: the first in TASK_OWNED_FIELDS order is named.
      await expect(hint({ status: 'done', title: 'New' })).resolves.toMatchObject({ field: 'title' });
    });

    it('refuses board moves to another column but keeps rank and cycle editable', async () => {
      const { key, scope } = mirror;
      const move = updateTask(ctx, world.memberActor, {
        key: `${key}-786.1.2`,
        status: 'in_progress',
        position: { before: `${key}-786` },
      });
      expect((await rejection(move, TaskMirrored)).extensions.field).toBe('status');

      // Reorder within the column: nested goes above its parent subtask.
      const reordered = await updateTask(ctx, world.memberActor, {
        key: 'BACK-786.1.2',
        position: { before: `${key}-786.1` },
      });
      const subtask = await getTask(ctx, world.memberActor, { key: `${key}-786.1` });
      expect(reordered.rank).toBeLessThan(subtask.rank);

      const cycle = await createCycleRow(ctx.db, scope);
      const planned = await updateTask(ctx, world.agentActor, { key: 'back-786', cycle: cycle.number });
      expect(planned.cycle).toMatchObject({ id: cycle.id });
      await expect(
        updateTask(ctx, world.agentActor, { key: `${key}-786`, cycle: null }),
      ).resolves.toMatchObject({
        cycle: null,
      });
    });

    it('accepts writes that send the stored values of owned fields', async () => {
      const { key } = mirror;
      const current = await getTask(ctx, world.memberActor, { key: `${key}-786` });
      const same = await updateTask(ctx, world.memberActor, {
        key: `${key}-786`,
        title: current.title,
        status: current.status,
        priority: current.priority,
        assignee: world.owner.id,
        milestone: mirror.milestone.id,
      });
      expect(same.updatedAt).toBe(current.updatedAt);
    });

    it('refuses new tasks in a mirrored project with a backlog task create hint', async () => {
      const error = await rejection(
        createTask(ctx, world.agentActor, { project: mirror.key, title: 'Retry SEPA mandates' }),
        ProjectMirrored,
      );
      expect(error.code).toBe('PROJECT_MIRRORED');
      expect(error.message).toBe(
        'Tasks in Payments API come from Backlog.md. Add a file under backlog/tasks/, or run backlog task create, and push. It shows up here after the next refresh.',
      );
      expect(error.extensions).toEqual({ hint: 'backlog task create "Retry SEPA mandates"' });
      // A read-only key is told about its access first.
      const reader = keyActor(world, { projects: 'all', access: 'read' });
      await expect(createTask(ctx, reader, { project: mirror.key, title: 'x' })).rejects.toThrow(Forbidden);
    });

    it('locks paused and failed mirrors too, and nothing once detached', async () => {
      const w = await createWorld(ctx.db);
      const paused = await createMirroredProject(ctx.db, w, { state: 'paused' });
      await expect(updateTask(ctx, w.memberActor, { key: `${paused.key}-786`, title: 'x' })).rejects.toThrow(
        TaskMirrored,
      );

      const detached = await createMirroredProject(ctx.db, w, { state: 'detached' });
      const task = await updateTask(ctx, w.memberActor, {
        key: 'BACK-786',
        project: detached.key,
        status: 'done',
        title: 'Now editable',
      });
      expect(task).toMatchObject({ status: 'done', title: 'Now editable', locked: [] });
      // The Backlog.md block stays as a read-only record, still linked to the file it came from
      // (frame 5k: "Was mirrored from … View file").
      expect(task.backlog).toMatchObject({
        id: 'BACK-786',
        file: expect.stringContaining('back-786'),
        fileUrl: expect.stringContaining('back-786'),
      });
      const created = await createTask(ctx, w.memberActor, { project: detached.key, title: 'After detach' });
      expect(created.number).toBe(788);
    });

    it('locks hidden tasks of a mirror like the others', async () => {
      const error = await rejection(
        updateTask(ctx, world.memberActor, { key: 'BACK-12', status: 'todo' }),
        TaskMirrored,
      );
      expect(error.extensions).toMatchObject({ field: 'status', backlogId: 'BACK-12' });
      expect(error.extensions.file).toBeUndefined();
    });

    it('keeps new suffixed tasks unique per number and suffix', async () => {
      const again = createMirroredTaskRow(ctx.db, mirror.scope, {
        number: 786,
        keySuffix: '1',
        backlogId: 'BACK-786.1',
        createdById: world.owner.id,
      });
      await expect(again).rejects.toThrow();
    });
  });
});
