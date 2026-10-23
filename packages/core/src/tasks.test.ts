import type { Task, TaskListItem } from '@pm/contracts';
import { schema } from '@pm/db';
import { asc, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { listTaskActivity } from './activity';
import { Forbidden, Invalid, NotFound, TaskChanged } from './errors';
import { createProject, updateProject } from './projects';
import { createTask, getTask, listTasks, MIN_RANK_GAP, updateTask } from './tasks';
import {
  createCycleRow,
  createMilestoneRow,
  createUser,
  createWorld,
  isoDate,
  keyActor,
  projectRow,
  randomProjectKey,
  scopeOf,
  type TestContext,
  testContext,
  type World,
} from './testing/fixtures';

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

describe('tasks (M2)', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = testContext();
  });
  afterAll(async () => {
    await ctx?.close();
  });

  /** A fresh workspace with one project; returns the world, the project key and its row. */
  async function setup(name = 'Board') {
    const world = await createWorld(ctx.db);
    const key = randomProjectKey();
    await createProject(ctx, world.ownerActor, { name, key });
    const row = await projectRow(ctx.db, world.workspaceId, key);
    return { world, key, row, scope: scopeOf(row) };
  }

  /** Keys of a status column in board order. */
  async function column(world: World, key: string, status: Task['status']) {
    const page = await listTasks(ctx, world.ownerActor, { project: key, status, order: 'board', limit: 200 });
    return page.items.map((t) => t.key);
  }

  describe('ranks', () => {
    it('puts new tasks at the top of their status column', async () => {
      const { world, key } = await setup();
      const a = await createTask(ctx, world.ownerActor, { project: key, title: 'A' });
      const b = await createTask(ctx, world.ownerActor, { project: key, title: 'B' });
      const c = await createTask(ctx, world.ownerActor, { project: key, title: 'C' });
      const other = await createTask(ctx, world.ownerActor, { project: key, title: 'D', status: 'backlog' });
      expect([a.rank, b.rank, c.rank]).toEqual([0, -1, -2]);
      expect(other.rank).toBe(0);
      expect(await column(world, key, 'todo')).toEqual([c.key, b.key, a.key]);
    });

    it('places a task before or after another card, in the same or another column', async () => {
      const { world, key } = await setup();
      const tasks: Task[] = [];
      for (const title of ['A', 'B', 'C'])
        tasks.push(await createTask(ctx, world.ownerActor, { project: key, title }));
      const [ta, tb, tc] = tasks as [Task, Task, Task];
      // Column is C, B, A. Move A between C and B.
      const moved = await updateTask(ctx, world.memberActor, { key: ta.key, position: { after: tc.key } });
      expect(moved.rank).toBe((tc.rank + tb.rank) / 2);
      expect(await column(world, key, 'todo')).toEqual([tc.key, ta.key, tb.key]);
      // Before the first card: one step above it.
      const top = await updateTask(ctx, world.memberActor, { key: tb.key, position: { before: tc.key } });
      expect(top.rank).toBe(tc.rank - 1);
      expect(await column(world, key, 'todo')).toEqual([tb.key, tc.key, ta.key]);

      // Status and position in one update; rank-only moves record no activity.
      const review = await createTask(ctx, world.ownerActor, {
        project: key,
        title: 'R',
        status: 'in_review',
      });
      const into = await updateTask(ctx, world.memberActor, {
        key: tc.key,
        status: 'in_review',
        position: { after: review.key },
      });
      expect(into).toMatchObject({ status: 'in_review', rank: review.rank + 1 });
      expect(await column(world, key, 'in_review')).toEqual([review.key, tc.key]);
      const { items } = await listTaskActivity(ctx, world.ownerActor, { key: ta.key });
      expect(items.map((i) => i.type)).toEqual(['task.created']);
      const history = await listTaskActivity(ctx, world.ownerActor, { key: tc.key });
      expect(history.items.at(-1)?.changes).toEqual([{ field: 'status', from: 'todo', to: 'in_review' }]);

      // A status change without position goes to the top of the new column.
      const done1 = await updateTask(ctx, world.memberActor, { key: ta.key, status: 'done' });
      const done2 = await updateTask(ctx, world.memberActor, { key: tb.key, status: 'done' });
      expect(done2.rank).toBe(done1.rank - 1);
      expect(await column(world, key, 'done')).toEqual([tb.key, ta.key]);
    });

    it('renumbers the column when the gap gets too small, leaving the other tasks unchanged', async () => {
      const { world, key, row } = await setup();
      const tasks: Task[] = [];
      for (const title of ['A', 'B', 'C', 'D'])
        tasks.push(await createTask(ctx, world.ownerActor, { project: key, title }));
      const [ta, tb, tc, td] = tasks as [Task, Task, Task, Task];
      // Squeeze A and B together: A at 5, B at 5 + 1e-10, C at 7, D at 9.
      const ranks = new Map([
        [ta.id, 5],
        [tb.id, 5 + MIN_RANK_GAP / 10],
        [tc.id, 7],
        [td.id, 9],
      ]);
      for (const [id, rank] of ranks) {
        await ctx.db.execute(sql`update task set rank = ${rank} where id = ${id}`);
      }
      const before = await ctx.db
        .select({ id: schema.task.id, updatedAt: schema.task.updatedAt })
        .from(schema.task)
        .where(eq(schema.task.projectId, row.id));

      const moved = await updateTask(ctx, world.memberActor, { key: td.key, position: { after: ta.key } });
      expect(await column(world, key, 'todo')).toEqual([ta.key, td.key, tb.key, tc.key]);
      expect(moved.rank).toBe(1.5);
      const after = await ctx.db
        .select({ id: schema.task.id, rank: schema.task.rank, updatedAt: schema.task.updatedAt })
        .from(schema.task)
        .where(eq(schema.task.projectId, row.id))
        .orderBy(asc(schema.task.rank));
      expect(after.map((r) => r.rank)).toEqual([1, 1.5, 2, 3]);
      // Renumbered neighbours keep their updated_at, so their ifUpdatedAt stays valid.
      for (const r of after) {
        if (r.id === td.id) continue;
        expect(r.updatedAt).toEqual(before.find((b) => b.id === r.id)?.updatedAt);
      }
    });

    it('rejects positions outside the target column or the project', async () => {
      const { world, key } = await setup();
      const a = await createTask(ctx, world.ownerActor, { project: key, title: 'A' });
      const b = await createTask(ctx, world.ownerActor, { project: key, title: 'B', status: 'backlog' });
      const other = await setup('Other');
      const foreign = await createTask(ctx, other.world.ownerActor, { project: other.key, title: 'F' });
      await expect(
        updateTask(ctx, world.ownerActor, { key: a.key, position: { before: b.key } }),
      ).rejects.toThrow(/not in the Todo column/);
      await expect(
        updateTask(ctx, world.ownerActor, { key: a.key, position: { after: a.key } }),
      ).rejects.toThrow(Invalid);
      await expect(
        updateTask(ctx, world.ownerActor, { key: a.key, position: { after: foreign.key } }),
      ).rejects.toThrow(/is not in project/);
      await expect(
        updateTask(ctx, world.ownerActor, { key: a.key, position: { after: `${key}-999` } }),
      ).rejects.toThrow(Invalid);
      // With the status change, the target column is the new one.
      await expect(
        updateTask(ctx, world.ownerActor, { key: a.key, status: 'backlog', position: { after: b.key } }),
      ).resolves.toMatchObject({ status: 'backlog', rank: b.rank + 1 });
    });
  });

  describe('ifUpdatedAt', () => {
    it('rejects a stale write with the current task and accepts a fresh one', async () => {
      const { world, key } = await setup();
      const task = await createTask(ctx, world.ownerActor, { project: key, title: 'Original' });
      const changed = await updateTask(ctx, world.memberActor, {
        key: task.key,
        title: 'Changed',
        ifUpdatedAt: task.updatedAt,
      });
      expect(changed.title).toBe('Changed');

      const error = await updateTask(ctx, world.agentActor, {
        key: task.key,
        status: 'done',
        ifUpdatedAt: task.updatedAt,
      }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(TaskChanged);
      expect((error as TaskChanged).code).toBe('TASK_CHANGED');
      expect((error as TaskChanged).task).toEqual(changed);
      // Nothing was written.
      await expect(getTask(ctx, world.ownerActor, { key: task.key })).resolves.toEqual(changed);
      const { items } = await listTaskActivity(ctx, world.ownerActor, { key: task.key });
      expect(items).toHaveLength(2);
    });

    it('compares at millisecond precision although updated_at keeps microseconds', async () => {
      const { world, key } = await setup();
      const task = await createTask(ctx, world.ownerActor, { project: key, title: 'Micro' });
      await ctx.db.execute(
        sql`update task set updated_at = '2026-10-23T08:00:00.123456Z' where id = ${task.id}`,
      );
      const loaded = await getTask(ctx, world.ownerActor, { key: task.key });
      expect(loaded.updatedAt).toBe('2026-10-23T08:00:00.123Z');
      await expect(
        updateTask(ctx, world.ownerActor, {
          key: task.key,
          priority: 'low',
          ifUpdatedAt: '2026-10-23T08:00:00.122Z',
        }),
      ).rejects.toThrow(TaskChanged);
      await expect(
        updateTask(ctx, world.ownerActor, { key: task.key, priority: 'low', ifUpdatedAt: loaded.updatedAt }),
      ).resolves.toMatchObject({ priority: 'low' });
    });
  });

  describe('milestone and cycle', () => {
    it('sets, changes and clears both with activity and cycleAddedAt', async () => {
      const { world, key, scope } = await setup();
      const m1 = await createMilestoneRow(ctx.db, scope, {
        createdById: world.owner.id,
        name: 'Webhooks v2',
      });
      const m2 = await createMilestoneRow(ctx.db, scope, { createdById: world.owner.id });
      const current = await createCycleRow(ctx.db, scope);
      const next = await createCycleRow(ctx.db, scope, { startsOn: isoDate(11), endsOn: isoDate(24) });

      const created = await createTask(ctx, world.agentActor, {
        project: key,
        title: 'Planned work',
        milestone: m1.id,
        cycle: 'current',
      });
      expect(created.milestone).toEqual({
        id: m1.id,
        name: 'Webhooks v2',
        status: 'planned',
        targetDate: null,
      });
      expect(created.cycle).toMatchObject({ id: current.id, number: current.number, state: 'current' });
      expect(created.cycleAddedAt).not.toBeNull();

      const moved = await updateTask(ctx, world.memberActor, {
        key: created.key,
        milestone: m2.id,
        cycle: 'next',
      });
      expect(moved.milestone?.id).toBe(m2.id);
      expect(moved.cycle).toMatchObject({ id: next.id, state: 'upcoming' });
      expect(Date.parse(moved.cycleAddedAt ?? '')).toBeGreaterThanOrEqual(
        Date.parse(created.cycleAddedAt ?? ''),
      );

      // By number, and the same cycle again is no change.
      const same = await updateTask(ctx, world.memberActor, { key: created.key, cycle: next.number });
      expect(same.updatedAt).toBe(moved.updatedAt);

      const cleared = await updateTask(ctx, world.memberActor, {
        key: created.key,
        milestone: null,
        cycle: null,
      });
      expect(cleared).toMatchObject({ milestone: null, cycle: null, cycleAddedAt: null });

      const { items } = await listTaskActivity(ctx, world.ownerActor, { key: created.key });
      expect(
        items.map((i) => i.changes.filter((c) => c.field === 'milestone' || c.field === 'cycle')),
      ).toEqual([
        [
          { field: 'milestone', from: null, to: { id: m1.id, name: 'Webhooks v2' } },
          { field: 'cycle', from: null, to: { id: current.id, number: current.number, name: null } },
        ],
        [
          { field: 'milestone', from: { id: m1.id, name: 'Webhooks v2' }, to: { id: m2.id, name: m2.name } },
          {
            field: 'cycle',
            from: { id: current.id, number: current.number, name: null },
            to: { id: next.id, number: next.number, name: null },
          },
        ],
        [
          { field: 'milestone', from: { id: m2.id, name: m2.name }, to: null },
          { field: 'cycle', from: { id: next.id, number: next.number, name: null }, to: null },
        ],
      ]);
    });

    it('rejects milestones and cycles of other projects, missing or completed cycles, and switched-off features', async () => {
      const { world, key, scope } = await setup();
      const other = await setup('Other');
      const foreignMilestone = await createMilestoneRow(ctx.db, other.scope, {
        createdById: other.world.owner.id,
      });
      await createCycleRow(ctx.db, other.scope);
      const past = await createCycleRow(ctx.db, scope, {
        startsOn: isoDate(-20),
        endsOn: isoDate(-10),
        completedAt: new Date(),
      });
      // Past its end date but not ended by the job yet: also completed.
      const overdue = await createCycleRow(ctx.db, scope, { startsOn: isoDate(-9), endsOn: isoDate(-1) });

      const create = (extra: object) =>
        createTask(ctx, world.ownerActor, { project: key, title: 'x', ...extra });
      await expect(create({ milestone: foreignMilestone.id })).rejects.toThrow(/not in project/);
      await expect(create({ cycle: 'current' })).rejects.toThrow(/has no current cycle/);
      await expect(create({ cycle: 'next' })).rejects.toThrow(/has no upcoming cycle/);
      await expect(create({ cycle: 99 })).rejects.toThrow(/Cycle 99 does not exist/);
      await expect(create({ cycle: past.number })).rejects.toThrow(/is completed/);
      await expect(create({ cycle: overdue.number })).rejects.toThrow(/is completed/);

      const milestone = await createMilestoneRow(ctx.db, scope, { createdById: world.owner.id });
      await createCycleRow(ctx.db, scope);
      await updateProject(ctx, world.ownerActor, { project: key, usesMilestones: false, usesCycles: false });
      await expect(create({ milestone: milestone.id })).rejects.toThrow(/does not use milestones/);
      await expect(create({ cycle: 'current' })).rejects.toThrow(/does not use cycles/);
      // Clearing still works with the feature off.
      const task = await create({});
      await expect(
        updateTask(ctx, world.ownerActor, { key: task.key, milestone: null, cycle: null }),
      ).resolves.toMatchObject({
        milestone: null,
      });
      // Nothing half-written by the refused calls.
      const count = await ctx.db
        .select({ id: schema.task.id })
        .from(schema.task)
        .where(eq(schema.task.projectId, scope.projectId));
      expect(count).toHaveLength(1);
    });

    it('activates a planned milestone when one of its tasks starts', async () => {
      const { world, key, scope } = await setup();
      const status = async (id: string) =>
        (
          await ctx.db
            .select({ status: schema.milestone.status })
            .from(schema.milestone)
            .where(eq(schema.milestone.id, id))
        )[0]?.status;
      const m1 = await createMilestoneRow(ctx.db, scope, { createdById: world.owner.id });
      const task = await createTask(ctx, world.ownerActor, { project: key, title: 'T', milestone: m1.id });
      await updateTask(ctx, world.ownerActor, { key: task.key, status: 'backlog' });
      expect(await status(m1.id)).toBe('planned');
      await updateTask(ctx, world.ownerActor, { key: task.key, status: 'in_progress' });
      expect(await status(m1.id)).toBe('active');

      // Created started, or a started task joining the milestone.
      const m2 = await createMilestoneRow(ctx.db, scope, { createdById: world.owner.id });
      await createTask(ctx, world.ownerActor, {
        project: key,
        title: 'U',
        milestone: m2.id,
        status: 'in_review',
      });
      expect(await status(m2.id)).toBe('active');
      const m3 = await createMilestoneRow(ctx.db, scope, { createdById: world.owner.id });
      await updateTask(ctx, world.ownerActor, { key: task.key, milestone: m3.id });
      expect(await status(m3.id)).toBe('active');
      // Completed milestones stay completed.
      const m4 = await createMilestoneRow(ctx.db, scope, {
        createdById: world.owner.id,
        status: 'completed',
        completedAt: new Date(),
      });
      await updateTask(ctx, world.ownerActor, { key: task.key, milestone: m4.id });
      expect(await status(m4.id)).toBe('completed');
    });
  });

  describe('list across projects', () => {
    let world: World;
    const keys: string[] = [];
    const ids: string[] = [];

    beforeAll(async () => {
      world = await createWorld(ctx.db);
      for (const name of ['Alpha', 'Beta', 'Gamma']) {
        const key = randomProjectKey();
        const project = await createProject(ctx, world.ownerActor, { name, key });
        keys.push(key);
        ids.push(project.id);
        for (const [i, status] of (['todo', 'todo', 'in_progress', 'done'] as const).entries()) {
          await createTask(ctx, world.ownerActor, {
            project: key,
            title: `${name} ${i}`,
            status,
            assignee: i === 0 ? world.member.id : null,
          });
        }
      }
    });

    async function all(actor: Parameters<typeof listTasks>[1], input: Parameters<typeof listTasks>[2]) {
      const items: TaskListItem[] = [];
      let cursor: string | undefined;
      for (let i = 0; i < 50; i++) {
        const page = await listTasks(ctx, actor, { ...input, cursor, limit: 2 });
        items.push(...page.items);
        if (!page.nextCursor) return items;
        cursor = page.nextCursor;
      }
      throw new Error('too many pages');
    }

    it('spans every project the caller can read when project is omitted', async () => {
      const page = await listTasks(ctx, world.memberActor, {});
      expect(page.items).toHaveLength(12);
      expect(page.counts).toEqual({
        backlog: 0,
        todo: 6,
        in_progress: 3,
        in_review: 0,
        done: 3,
        canceled: 0,
      });
      expect(new Set(page.items.map((t) => t.project.key))).toEqual(new Set(keys));
      for (const item of page.items) expect(item.key.startsWith(`${item.project.key}-`)).toBe(true);

      const mine = await listTasks(ctx, world.memberActor, { assignee: 'me' });
      expect(mine.items.map((t) => t.title).sort()).toEqual(['Alpha 0', 'Beta 0', 'Gamma 0']);

      const two = await listTasks(ctx, world.memberActor, {
        project: [keys[0] as string, keys[1] as string],
      });
      expect(two.items).toHaveLength(8);
      // Another workspace sees none of it.
      const stranger = await createWorld(ctx.db);
      await expect(listTasks(ctx, stranger.memberActor, {})).resolves.toMatchObject({ items: [] });
    });

    it('honours a key scoped to two projects', async () => {
      const scoped = keyActor(world, { projects: [ids[0] as string, ids[2] as string], access: 'read' });
      const page = await listTasks(ctx, scoped, {});
      expect(new Set(page.items.map((t) => t.project.key))).toEqual(new Set([keys[0], keys[2]]));
      expect(page.items).toHaveLength(8);
      await expect(listTasks(ctx, scoped, { project: keys[1] as string })).rejects.toThrow(Forbidden);
      await expect(
        listTasks(ctx, scoped, { project: [keys[0] as string, keys[1] as string] }),
      ).rejects.toThrow(Forbidden);
      const none = keyActor(world, { projects: [], access: 'read' });
      await expect(listTasks(ctx, none, {})).resolves.toMatchObject({ items: [], nextCursor: null });
    });

    it('pages both orders across projects without gaps or repeats', async () => {
      for (const order of ['list', 'board'] as const) {
        const paged = await all(world.memberActor, { order });
        const full = await listTasks(ctx, world.memberActor, { order, limit: 200 });
        expect(paged.map((t) => t.id)).toEqual(full.items.map((t) => t.id));
        expect(new Set(paged.map((t) => t.id)).size).toBe(12);
      }
      const board = await listTasks(ctx, world.memberActor, { order: 'board', limit: 200 });
      const sorted = [...board.items].sort((a, b) =>
        a.status === b.status ? a.rank - b.rank || (a.id < b.id ? -1 : 1) : 0,
      );
      expect(board.items.map((t) => t.id)).toEqual(sorted.map((t) => t.id));

      // A cursor only works with the order it came from.
      const listPage = await listTasks(ctx, world.memberActor, { limit: 2 });
      await expect(
        listTasks(ctx, world.memberActor, { order: 'board', cursor: listPage.nextCursor ?? undefined }),
      ).rejects.toThrow(Invalid);
    });

    it('filters by milestone and cycle, per project for current and next', async () => {
      const w = await createWorld(ctx.db);
      const a = randomProjectKey();
      const b = randomProjectKey();
      await createProject(ctx, w.ownerActor, { name: 'A', key: a });
      await createProject(ctx, w.ownerActor, { name: 'B', key: b });
      const sa = scopeOf(await projectRow(ctx.db, w.workspaceId, a));
      const sb = scopeOf(await projectRow(ctx.db, w.workspaceId, b));
      const milestone = await createMilestoneRow(ctx.db, sa, { createdById: w.owner.id });
      const ca = await createCycleRow(ctx.db, sa);
      const cb = await createCycleRow(ctx.db, sb, { startsOn: isoDate(-1), endsOn: isoDate(5) });
      const nb = await createCycleRow(ctx.db, sb, { startsOn: isoDate(6), endsOn: isoDate(10) });

      const t1 = await createTask(ctx, w.ownerActor, {
        project: a,
        title: 'a1',
        milestone: milestone.id,
        cycle: 'current',
      });
      const t2 = await createTask(ctx, w.ownerActor, { project: b, title: 'b1', cycle: 'current' });
      const t3 = await createTask(ctx, w.ownerActor, { project: b, title: 'b2', cycle: nb.number });
      const t4 = await createTask(ctx, w.ownerActor, { project: a, title: 'a2' });
      const keysOf = (page: { items: TaskListItem[] }) => page.items.map((t) => t.key).sort();

      expect(keysOf(await listTasks(ctx, w.memberActor, { milestone: milestone.id }))).toEqual([t1.key]);
      expect(keysOf(await listTasks(ctx, w.memberActor, { milestone: 'none' }))).toEqual(
        [t2.key, t3.key, t4.key].sort(),
      );
      expect(keysOf(await listTasks(ctx, w.memberActor, { cycle: 'current' }))).toEqual(
        [t1.key, t2.key].sort(),
      );
      expect(keysOf(await listTasks(ctx, w.memberActor, { cycle: 'next' }))).toEqual([t3.key]);
      expect(keysOf(await listTasks(ctx, w.memberActor, { cycle: 'none' }))).toEqual([t4.key]);
      // Cycle numbers are per project: 1 is the first cycle of each.
      expect(ca.number).toBe(1);
      expect(cb.number).toBe(1);
      expect(keysOf(await listTasks(ctx, w.memberActor, { cycle: 1 }))).toEqual([t1.key, t2.key].sort());
      expect(keysOf(await listTasks(ctx, w.memberActor, { project: b, cycle: '2' }))).toEqual([t3.key]);
      expect((await listTasks(ctx, w.memberActor, { cycle: 7 })).items).toEqual([]);

      const item = (await listTasks(ctx, w.memberActor, { project: a, milestone: milestone.id })).items[0];
      expect(item).toMatchObject({
        project: { key: a, name: 'A' },
        milestone: { id: milestone.id, status: 'planned' },
        cycle: { id: ca.id, number: 1, state: 'current' },
      });
    });
  });

  it('derives cycle state from the context clock and time zone', async () => {
    const { world, key, scope } = await setup();
    const cycle = await createCycleRow(ctx.db, scope, { startsOn: '2026-11-02', endsOn: '2026-11-15' });
    const at = (iso: string, timeZone?: string) => ({ ...ctx, now: () => new Date(iso), timeZone });
    const task = await createTask(at('2026-11-01T12:00:00Z'), world.ownerActor, {
      project: key,
      title: 'Clocked',
      cycle: 'next',
    });
    expect(task.cycle).toMatchObject({ id: cycle.id, state: 'upcoming' });
    // 23:30 UTC on Nov 1 is already Nov 2 in Berlin.
    await expect(
      getTask(at('2026-11-01T23:30:00Z', 'Europe/Berlin'), world.ownerActor, { key: task.key }),
    ).resolves.toMatchObject({
      cycle: { state: 'current' },
    });
    const page = await listTasks(at('2026-11-16T00:00:00Z'), world.ownerActor, { project: key });
    expect(page.items[0]?.cycle?.state).toBe('completed');
  });
});
