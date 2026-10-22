import { schema } from '@pm/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { listTaskActivity } from './activity';
import { Forbidden, Invalid, NotFound } from './errors';
import { createProject } from './projects';
import { createTask, getTask, listTasks, updateTask } from './tasks';
import { createUser, createWorld, type TestContext, testContext, type World } from './testing/fixtures';

describe('tasks', () => {
  let ctx: TestContext;
  let world: World;

  beforeAll(async () => {
    ctx = testContext();
    world = await createWorld(ctx.db);
    await createProject(ctx, world.ownerActor, { name: 'Payments', key: 'PAY' });
  });
  afterAll(async () => {
    await ctx?.close();
  });

  it('creates tasks with defaults and gets them by key in any case', async () => {
    const task = await createTask(ctx, world.memberActor, { project: 'pay', title: '  Retry webhooks  ' });
    expect(task).toMatchObject({
      title: 'Retry webhooks',
      status: 'todo',
      priority: 'none',
      assignee: null,
      description: null,
      project: { key: 'PAY', name: 'Payments' },
      createdBy: { id: world.member.id, kind: 'person' },
      createdOnBehalfOf: null,
    });
    expect(task.key).toBe(`PAY-${task.number}`);
    await expect(getTask(ctx, world.ownerActor, { key: task.key.toLowerCase() })).resolves.toEqual(task);
    await expect(getTask(ctx, world.ownerActor, { key: 'PAY-99999' })).rejects.toThrow(NotFound);
    await expect(getTask(ctx, world.ownerActor, { key: 'NOPE-1' })).rejects.toThrow(NotFound);
  });

  it('gives 20 concurrent creations 20 distinct, consecutive numbers', async () => {
    const w = await createWorld(ctx.db);
    await createProject(ctx, w.ownerActor, { name: 'Race', key: 'RACE' });
    const tasks = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        createTask(ctx, w.memberActor, { project: 'RACE', title: `t${i}` }),
      ),
    );
    const numbers = tasks.map((t) => t.number).sort((a, b) => a - b);
    expect(new Set(numbers).size).toBe(20);
    expect(numbers).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });

  it('records agent work on behalf of the responsible human', async () => {
    const task = await createTask(ctx, world.agentActor, {
      project: 'PAY',
      title: 'Agent task',
      priority: 'high',
      assignee: 'me',
    });
    expect(task.createdBy).toMatchObject({ id: world.agent.id, kind: 'agent' });
    expect(task.createdOnBehalfOf?.id).toBe(world.member.id);
    expect(task.assignee).toMatchObject({
      id: world.agent.id,
      kind: 'agent',
      responsible: { id: world.member.id, kind: 'person' },
    });
  });

  it('records activity rows that match the changes', async () => {
    const task = await createTask(ctx, world.ownerActor, {
      project: 'PAY',
      title: 'Signature check',
      description: 'Reject old timestamps',
      status: 'backlog',
      priority: 'medium',
      assignee: world.member.id,
    });
    const updated = await updateTask(ctx, world.agentActor, {
      key: task.key,
      title: 'Signature check accepts expired timestamps',
      status: 'in_progress',
      priority: 'medium', // unchanged: not recorded
      assignee: world.agent.id,
      description: null,
    });
    expect(updated).toMatchObject({
      title: 'Signature check accepts expired timestamps',
      status: 'in_progress',
      description: null,
      assignee: { id: world.agent.id },
    });

    const rows = await ctx.db.select().from(schema.activity).where(eq(schema.activity.taskId, task.id));
    expect(rows).toHaveLength(2);

    const { items } = await listTaskActivity(ctx, world.memberActor, { key: task.key });
    expect(items.map((a) => a.type)).toEqual(['task.created', 'task.updated']);
    const [created, change] = items;
    expect(created).toMatchObject({
      taskKey: task.key,
      actor: { id: world.owner.id },
      onBehalfOf: null,
      changes: [
        { field: 'title', from: null, to: 'Signature check' },
        { field: 'description', from: null, to: 'Reject old timestamps' },
        { field: 'status', from: null, to: 'backlog' },
        { field: 'priority', from: null, to: 'medium' },
        { field: 'assignee', from: null, to: { id: world.member.id, kind: 'person' } },
      ],
    });
    expect(change).toMatchObject({
      actor: { id: world.agent.id, kind: 'agent' },
      onBehalfOf: { id: world.member.id },
      changes: [
        { field: 'title', from: 'Signature check', to: 'Signature check accepts expired timestamps' },
        { field: 'description', from: 'Reject old timestamps', to: null },
        { field: 'status', from: 'backlog', to: 'in_progress' },
        { field: 'assignee', from: { id: world.member.id }, to: { id: world.agent.id, kind: 'agent' } },
      ],
    });

    // Activity is stored with ids and names, as written.
    const stored = rows.find((r) => r.type === 'task.updated');
    expect(stored?.changes).toContainEqual({ field: 'assignee', from: world.member.id, to: world.agent.id });
    expect(stored?.onBehalfOfId).toBe(world.member.id);
  });

  it('writes nothing when an update changes no value', async () => {
    const task = await createTask(ctx, world.ownerActor, { project: 'PAY', title: 'Same', priority: 'low' });
    const again = await updateTask(ctx, world.ownerActor, { key: task.key, title: 'Same', priority: 'low' });
    expect(again.updatedAt).toBe(task.updatedAt);
    const { items } = await listTaskActivity(ctx, world.ownerActor, { key: task.key });
    expect(items).toHaveLength(1);
  });

  it('rejects assignees outside the workspace', async () => {
    const outsider = await createUser(ctx.db, { name: 'Outsider' });
    await expect(
      createTask(ctx, world.ownerActor, { project: 'PAY', title: 'x', assignee: outsider.id }),
    ).rejects.toThrow(Invalid);
  });

  it('keeps project-scoped and read-only keys within bounds', async () => {
    const w = await createWorld(ctx.db);
    const pay = await createProject(ctx, w.ownerActor, { name: 'Payments', key: 'PAY' });
    await createProject(ctx, w.ownerActor, { name: 'Web', key: 'WEB' });
    const web = await createTask(ctx, w.ownerActor, { project: 'WEB', title: 'Web task' });
    const payTask = await createTask(ctx, w.ownerActor, { project: 'PAY', title: 'Pay task' });

    const scoped = { ...w.agentActor, scope: { projects: [pay.id], access: 'write' as const } };
    await expect(getTask(ctx, scoped, { key: web.key })).rejects.toThrow(Forbidden);
    await expect(listTasks(ctx, scoped, { project: 'WEB' })).rejects.toThrow(Forbidden);
    await expect(listTaskActivity(ctx, scoped, { key: web.key })).rejects.toThrow(Forbidden);
    await expect(createTask(ctx, scoped, { project: 'WEB', title: 'x' })).rejects.toThrow(Forbidden);
    await expect(getTask(ctx, scoped, { key: payTask.key })).resolves.toMatchObject({ key: payTask.key });

    const readOnly = { ...w.agentActor, scope: { projects: 'all' as const, access: 'read' as const } };
    await expect(getTask(ctx, readOnly, { key: web.key })).resolves.toMatchObject({ key: web.key });
    await expect(createTask(ctx, readOnly, { project: 'WEB', title: 'x' })).rejects.toThrow(/read-only/);
    await expect(updateTask(ctx, readOnly, { key: web.key, title: 'x' })).rejects.toThrow(Forbidden);
    // Nothing was written by the refused calls.
    const { items } = await listTaskActivity(ctx, w.ownerActor, { key: web.key });
    expect(items).toHaveLength(1);
  });

  describe('list', () => {
    let w: World;
    beforeAll(async () => {
      w = await createWorld(ctx.db);
      await createProject(ctx, w.ownerActor, { name: 'List', key: 'LST' });
      const specs = [
        { title: 'Backlog low', status: 'backlog', priority: 'low' },
        { title: 'Todo urgent', status: 'todo', priority: 'urgent', assignee: w.agent.id },
        { title: 'Todo none', status: 'todo', priority: 'none' },
        { title: 'Todo high 1', status: 'todo', priority: 'high', assignee: 'me' },
        { title: 'Todo high 2', status: 'todo', priority: 'high' },
        { title: 'Doing medium', status: 'in_progress', priority: 'medium', assignee: w.member.id },
        { title: 'Done 100% fix', status: 'done', priority: 'urgent' },
        { title: 'Canceled', status: 'canceled', priority: 'none' },
      ] as const;
      for (const spec of specs) await createTask(ctx, w.ownerActor, { project: 'LST', ...spec });
    });

    it('orders by status, priority desc, then updated_at desc', async () => {
      const page = await listTasks(ctx, w.memberActor, { project: 'LST' });
      expect(page.items.map((t) => t.title)).toEqual([
        'Backlog low',
        'Todo urgent',
        'Todo high 2',
        'Todo high 1',
        'Todo none',
        'Doing medium',
        'Done 100% fix',
        'Canceled',
      ]);
      expect(page.nextCursor).toBeNull();
      expect(page.counts).toEqual({
        backlog: 1,
        todo: 4,
        in_progress: 1,
        in_review: 0,
        done: 1,
        canceled: 1,
      });
      expect(page.items[1]?.assignee).toMatchObject({ id: w.agent.id, responsible: { id: w.member.id } });
    });

    it('pages with a cursor without gaps or repeats', async () => {
      const seen: string[] = [];
      let cursor: string | undefined;
      for (let i = 0; i < 10; i++) {
        const page = await listTasks(ctx, w.memberActor, { project: 'LST', limit: 3, cursor });
        seen.push(...page.items.map((t) => t.title));
        if (!page.nextCursor) break;
        cursor = page.nextCursor;
      }
      const all = await listTasks(ctx, w.memberActor, { project: 'LST' });
      expect(seen).toEqual(all.items.map((t) => t.title));
      await expect(listTasks(ctx, w.memberActor, { project: 'LST', cursor: 'garbage' })).rejects.toThrow(
        Invalid,
      );
    });

    it('filters by status, priority, assignee and text, counting every status', async () => {
      const todo = await listTasks(ctx, w.memberActor, { project: 'LST', status: 'todo' });
      expect(todo.items).toHaveLength(4);
      expect(todo.counts.done).toBe(1);

      const urgent = await listTasks(ctx, w.memberActor, { project: 'LST', priority: ['urgent', 'high'] });
      expect(urgent.items.map((t) => t.title)).toEqual([
        'Todo urgent',
        'Todo high 2',
        'Todo high 1',
        'Done 100% fix',
      ]);

      const mine = await listTasks(ctx, w.ownerActor, { project: 'LST', assignee: 'me' });
      expect(mine.items.map((t) => t.title)).toEqual(['Todo high 1']);
      const agents = await listTasks(ctx, w.ownerActor, { project: 'LST', assignee: 'agents' });
      expect(agents.items.map((t) => t.title)).toEqual(['Todo urgent']);
      const member = await listTasks(ctx, w.ownerActor, { project: 'LST', assignee: w.member.id });
      expect(member.items.map((t) => t.title)).toEqual(['Doing medium']);

      const text = await listTasks(ctx, w.ownerActor, { project: 'LST', q: 'TODO h' });
      expect(text.items).toHaveLength(2);
      expect(text.counts).toEqual({
        backlog: 0,
        todo: 2,
        in_progress: 0,
        in_review: 0,
        done: 0,
        canceled: 0,
      });
      // LIKE wildcards in q are literal.
      const percent = await listTasks(ctx, w.ownerActor, { project: 'LST', q: '100%' });
      expect(percent.items.map((t) => t.title)).toEqual(['Done 100% fix']);

      const byKey = await listTasks(ctx, w.ownerActor, { project: 'LST', q: 'lst-1' });
      expect(byKey.items[0]?.key).toBe('LST-1');
    });
  });
});
