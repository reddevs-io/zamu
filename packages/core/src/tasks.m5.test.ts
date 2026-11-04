// M5 task fields in lists and writes: filters, orderings with keyset cursors, list row fields, due
// dates, and bulk changes.
import { TASK_SORTS, type TaskListItem, type TaskSort } from '@pm/contracts';
import { schema } from '@pm/db';
import { eq, inArray, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { listTaskActivity } from './activity';
import { Forbidden, Invalid, NotFound, TaskMirrored } from './errors';
import { createProject } from './projects';
import { NotSameProject } from './relations';
import { bulkUpdateTasks, createTask, getTask, listTasks, type TaskContext, updateTask } from './tasks';
import { createMirroredProject } from './testing/backlog';
import {
  addTaskBlockers,
  addTaskLabels,
  createCycleRow,
  createLabelRow,
  createMilestoneRow,
  createTaskRow,
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

/** Every page of a listing, `limit` rows at a time, following nextCursor. */
async function allPages(
  ctx: TaskContext,
  actor: World['memberActor'],
  input: Parameters<typeof listTasks>[2],
  limit: number,
): Promise<TaskListItem[]> {
  const items: TaskListItem[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 100; page++) {
    const result = await listTasks(ctx, actor, { ...input, limit, ...(cursor ? { cursor } : {}) });
    items.push(...result.items);
    if (!result.nextCursor) return items;
    cursor = result.nextCursor;
  }
  throw new Error('too many pages');
}

describe('tasks: M5 fields', () => {
  let ctx: TestContext;
  /** Today is 2026-11-04 in UTC for the due-date filters. */
  let clocked: TaskContext;
  let world: World;

  beforeAll(async () => {
    ctx = testContext();
    clocked = { ...ctx, now: () => new Date('2026-11-04T12:00:00Z') };
    world = await createWorld(ctx.db);
  });
  afterAll(async () => {
    await ctx?.close();
  });

  async function newProject(name = 'Fields') {
    const key = randomProjectKey();
    await createProject(ctx, world.ownerActor, { name, key });
    return { key, row: await projectRow(ctx.db, world.workspaceId, key) };
  }

  describe('list fields and filters', () => {
    let key: string;
    const keys: Record<string, string> = {};
    let labelIds: Record<string, string>;

    beforeAll(async () => {
      ({ key } = await newProject());
      const make = async (name: string, values: Record<string, unknown> = {}) => {
        keys[name] = (
          await createTask(clocked, world.memberActor, { project: key, title: name, ...values })
        ).key;
      };
      await make('overdue', { dueDate: '2026-11-03', labels: ['backend'] });
      await make('overdueDone', { dueDate: '2026-10-01', status: 'done' });
      await make('today', { dueDate: '2026-11-04', labels: ['payouts', 'Backend'] });
      await make('soonEnd', { dueDate: '2026-11-06' });
      await make('later', { dueDate: '2026-11-07' });
      await make('none', { labels: ['web'] });
      await make('blocked', { blockedBy: [keys.later as string] });
      await make('child', { parent: keys.none as string, status: 'done' });
      const list = await listTasks(clocked, world.memberActor, { project: key, limit: 200 });
      labelIds = Object.fromEntries(
        list.items.flatMap((item) => item.labels ?? []).map((label) => [label.name.toLowerCase(), label.id]),
      );
    });

    const titles = async (input: Record<string, unknown>) =>
      (await listTasks(clocked, world.memberActor, { project: key, limit: 200, ...input })).items
        .map((item) => item.title)
        .sort();

    it('returns labels, due date, blocked, subtask progress and parent key on each row', async () => {
      const page = await listTasks(clocked, world.memberActor, { project: key, limit: 200 });
      const byTitle = new Map(page.items.map((item) => [item.title, item]));
      expect(byTitle.get('today')).toMatchObject({
        labels: [
          { name: 'backend', source: 'app' },
          { name: 'payouts', source: 'app' },
        ],
        dueDate: '2026-11-04',
        blocked: false,
        subtaskProgress: { done: 0, total: 0 },
        parentKey: null,
      });
      expect(byTitle.get('blocked')).toMatchObject({ blocked: true, labels: [], dueDate: null });
      expect(byTitle.get('none')).toMatchObject({ subtaskProgress: { done: 1, total: 1 } });
      expect(byTitle.get('child')).toMatchObject({ parentKey: keys.none });
    });

    it('filters by labels (any of), due state, blocked, top level and parent', async () => {
      await expect(titles({ label: labelIds.backend })).resolves.toEqual(['overdue', 'today']);
      await expect(titles({ label: [labelIds.web, labelIds.payouts] })).resolves.toEqual(['none', 'today']);
      // Overdue and soon count open tasks only; soon is today and the next two days.
      await expect(titles({ due: 'overdue' })).resolves.toEqual(['overdue']);
      await expect(titles({ due: 'soon' })).resolves.toEqual(['soonEnd', 'today']);
      await expect(titles({ due: 'none' })).resolves.toEqual(['blocked', 'child', 'none']);
      await expect(titles({ due: 'set' })).resolves.toEqual([
        'later',
        'overdue',
        'overdueDone',
        'soonEnd',
        'today',
      ]);
      await expect(titles({ blocked: true })).resolves.toEqual(['blocked']);
      await expect(titles({ blocked: 'false', due: 'none' })).resolves.toEqual(['child', 'none']);
      await expect(titles({ topLevel: true, due: 'none' })).resolves.toEqual(['blocked', 'none']);
      await expect(titles({ parent: keys.none })).resolves.toEqual(['child']);
      await expect(titles({ parent: `${key}-99999` })).rejects.toThrow(NotFound);
    });

    it('records due date changes and reads them back', async () => {
      const task = await updateTask(clocked, world.memberActor, {
        key: keys.later as string,
        dueDate: '2026-12-24',
      });
      expect(task.dueDate).toBe('2026-12-24');
      const cleared = await updateTask(clocked, world.memberActor, { key: task.key, dueDate: null });
      expect(cleared.dueDate).toBeNull();
      const items = (await listTaskActivity(ctx, world.memberActor, { key: task.key })).items;
      expect(items[0]?.changes).toContainEqual({ field: 'dueDate', from: null, to: '2026-11-07' });
      expect(items.slice(1).map((item) => item.changes)).toEqual([
        [{ field: 'dueDate', from: '2026-11-07', to: '2026-12-24' }],
        [{ field: 'dueDate', from: '2026-12-24', to: null }],
      ]);
    });

    it('records label changes with the whole list, and keeps the recorded name after a rename', async () => {
      const task = await updateTask(ctx, world.memberActor, {
        key: keys.soonEnd as string,
        labels: ['zeta', 'Alpha'],
      });
      expect(task.labels?.map((label) => label.name)).toEqual(['Alpha', 'zeta']);
      const replaced = await updateTask(ctx, world.memberActor, {
        key: task.key,
        removeLabels: ['ALPHA'],
        addLabels: ['beta'],
      });
      expect(replaced.labels?.map((label) => label.name)).toEqual(['beta', 'zeta']);
      // Same set in another case: no change.
      await updateTask(ctx, world.memberActor, { key: task.key, labels: ['ZETA', 'Beta'] });
      const alpha = (task.labels ?? []).find((label) => label.name === 'Alpha');
      await ctx.db
        .update(schema.label)
        .set({ name: 'Renamed' })
        .where(eq(schema.label.id, alpha?.id as string));
      const items = (await listTaskActivity(ctx, world.memberActor, { key: task.key })).items;
      const labelChanges = items
        .flatMap((item) => item.changes)
        .filter((change) => change.field === 'labels');
      expect(labelChanges).toHaveLength(2);
      expect(labelChanges[0]).toMatchObject({
        from: [],
        to: [{ name: 'Alpha', color: expect.any(Number) }, { name: 'zeta' }],
      });
      expect(labelChanges[1]).toMatchObject({
        from: [{ name: 'Alpha' }, { name: 'zeta' }],
        to: [{ name: 'beta' }, { name: 'zeta' }],
      });
      const updatedAfter = await getTask(ctx, world.memberActor, { key: task.key });
      expect(Date.parse(updatedAfter.updatedAt)).toBeGreaterThan(Date.parse(task.createdAt));
    });

    it('refuses more than 20 labels on a task', async () => {
      const names = Array.from({ length: 20 }, (_, i) => `many-${i}`);
      const task = await createTask(ctx, world.memberActor, {
        project: key,
        title: 'Many labels',
        labels: names,
      });
      expect(task.labels).toHaveLength(20);
      await expect(
        updateTask(ctx, world.memberActor, { key: task.key, addLabels: ['one-more'] }),
      ).rejects.toThrow(Invalid);
    });
  });

  describe('several assignees, milestones and cycles', () => {
    let key: string;
    let m1: string;
    let m2: string;

    beforeAll(async () => {
      const created = await newProject('Many values');
      key = created.key;
      const scope = scopeOf(created.row);
      m1 = (await createMilestoneRow(ctx.db, scope, { createdById: world.owner.id })).id;
      m2 = (await createMilestoneRow(ctx.db, scope, { createdById: world.owner.id })).id;
      // Cycle 1 is current (started 3 days ago); cycle 2 starts later.
      await createCycleRow(ctx.db, scope);
      await createCycleRow(ctx.db, scope, { startsOn: isoDate(20), endsOn: isoDate(30) });
      const make = (title: string, values: Record<string, unknown>) =>
        createTask(ctx, world.memberActor, { project: key, title, ...values });
      await make('mine m1 c1', { assignee: 'me', milestone: m1, cycle: 1 });
      await make('agent m2 c2', { assignee: world.agent.id, milestone: m2, cycle: 2, status: 'in_review' });
      await make('owner none', { assignee: world.owner.id, status: 'done' });
      await make('nobody m1', { milestone: m1, cycle: 2 });
      await make('nobody none', {});
    });

    const page = (input: Record<string, unknown>) =>
      listTasks(ctx, world.memberActor, { project: key, limit: 200, ...input });
    const titles = async (input: Record<string, unknown>) =>
      (await page(input)).items.map((i) => i.title).sort();

    it('matches any of several assignees, none meaning unassigned', async () => {
      await expect(titles({ assignee: 'none' })).resolves.toEqual(['nobody m1', 'nobody none']);
      await expect(titles({ assignee: ['me', 'none'] })).resolves.toEqual([
        'mine m1 c1',
        'nobody m1',
        'nobody none',
      ]);
      await expect(titles({ assignee: ['agents', world.owner.id] })).resolves.toEqual([
        'agent m2 c2',
        'owner none',
      ]);
      // Single values still work.
      await expect(titles({ assignee: 'me' })).resolves.toEqual(['mine m1 c1']);
    });

    it('matches any of several milestones and cycles, with none', async () => {
      await expect(titles({ milestone: [m1, m2] })).resolves.toEqual([
        'agent m2 c2',
        'mine m1 c1',
        'nobody m1',
      ]);
      await expect(titles({ milestone: ['none', m2] })).resolves.toEqual([
        'agent m2 c2',
        'nobody none',
        'owner none',
      ]);
      await expect(titles({ cycle: ['current', 'none'] })).resolves.toEqual([
        'mine m1 c1',
        'nobody none',
        'owner none',
      ]);
      await expect(titles({ cycle: [1, 'next'] })).resolves.toEqual([
        'agent m2 c2',
        'mine m1 c1',
        'nobody m1',
      ]);
      await expect(titles({ cycle: [99] })).resolves.toEqual([]);
      await expect(titles({ cycle: [99, 'none'] })).resolves.toEqual(['nobody none', 'owner none']);
    });

    it('counts and pages with the whole filter applied on the server', async () => {
      const filtered = await page({ assignee: ['none', 'agents'], milestone: [m1, m2, 'none'] });
      expect(filtered.counts).toMatchObject({ todo: 2, in_review: 1, done: 0 });
      const paged = await allPages(ctx, world.memberActor, { project: key, assignee: ['none', 'agents'] }, 1);
      expect(paged.map((item) => item.title).sort()).toEqual(['agent m2 c2', 'nobody m1', 'nobody none']);
    });
  });

  describe('orderings', () => {
    let key: string;

    beforeAll(async () => {
      const created = await newProject('Sorts');
      key = created.key;
      const dues = ['2026-11-10', null, '2026-11-05', '2026-11-05', null, '2026-12-01', '2026-11-05', null];
      const priorities = ['urgent', 'none', 'high', 'high', 'low', 'medium', 'high', 'none'] as const;
      const statuses = [
        'todo',
        'done',
        'in_progress',
        'todo',
        'backlog',
        'todo',
        'in_review',
        'todo',
      ] as const;
      for (let i = 0; i < 16; i++) {
        await createTask(ctx, world.memberActor, {
          project: key,
          title: `Sort ${i}`,
          dueDate: dues[i % dues.length] ?? null,
          priority: priorities[i % priorities.length],
          status: statuses[i % statuses.length],
        });
      }
      // Ties on the last update, so the id decides.
      await ctx.db
        .update(schema.task)
        .set({ updatedAt: new Date('2026-11-01T10:00:00.123456Z') })
        .where(
          inArray(
            schema.task.id,
            ctx.db
              .select({ id: schema.task.id })
              .from(schema.task)
              .where(sql`${schema.task.projectId} = ${created.row.id} and ${schema.task.number} % 3 = 0`),
          ),
        );
    });

    for (const sort of TASK_SORTS) {
      it(`pages through sort=${sort} with keyset cursors`, async () => {
        const whole = (await listTasks(ctx, world.memberActor, { project: key, sort, limit: 200 })).items;
        expect(whole).toHaveLength(16);
        const paged = await allPages(ctx, world.memberActor, { project: key, sort }, 3);
        expect(paged.map((item) => item.key)).toEqual(whole.map((item) => item.key));
        // The documented order, checked on the leading key (ties need microseconds JS dates don't keep).
        const leading: Record<TaskSort, (item: TaskListItem) => number | string> = {
          priority: (item) => -priorityValue(item),
          due: (item) => item.dueDate ?? '9999-12-31',
          updated: (item) => -Date.parse(item.updatedAt),
          created: (item) => -Date.parse(item.createdAt),
          manual: (item) => item.rank ?? 0,
        };
        const values = whole.map(leading[sort]);
        expect(values).toEqual([...values].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0)));
        if (sort === 'due') expect(whole.at(-1)?.dueDate).toBeNull();
      });
    }

    it('keeps the status grouping without sort and refuses cursors of another ordering', async () => {
      const list = await allPages(ctx, world.memberActor, { project: key }, 5);
      const board = await allPages(ctx, world.memberActor, { project: key, order: 'board' }, 5);
      expect(list).toHaveLength(16);
      expect(board).toHaveLength(16);
      const page = await listTasks(ctx, world.memberActor, { project: key, sort: 'due', limit: 2 });
      const cursor = page.nextCursor as string;
      await expect(
        listTasks(ctx, world.memberActor, { project: key, sort: 'priority', cursor }),
      ).rejects.toThrow(Invalid);
      await expect(listTasks(ctx, world.memberActor, { project: key, cursor })).rejects.toThrow(Invalid);
      const listCursor = (await listTasks(ctx, world.memberActor, { project: key, limit: 2 }))
        .nextCursor as string;
      await expect(
        listTasks(ctx, world.memberActor, { project: key, sort: 'due', cursor: listCursor }),
      ).rejects.toThrow(Invalid);
      const forged = Buffer.from(JSON.stringify(['sort', 'due', 5, 'x', 'y'])).toString('base64url');
      await expect(
        listTasks(ctx, world.memberActor, { project: key, sort: 'due', cursor: forged }),
      ).rejects.toThrow(Invalid);
    });
  });

  describe('bulk changes', () => {
    it('changes tasks of several projects in one go, with one activity row per changed task', async () => {
      const a = await newProject('Bulk A');
      const b = await newProject('Bulk B');
      const a1 = await createTask(ctx, world.memberActor, { project: a.key, title: 'A1' });
      const a2 = await createTask(ctx, world.memberActor, {
        project: a.key,
        title: 'A2',
        status: 'in_progress',
        priority: 'high',
      });
      const b1 = await createTask(ctx, world.memberActor, { project: b.key, title: 'B1', labels: ['ops'] });
      const result = await bulkUpdateTasks(ctx, world.memberActor, {
        keys: [b1.key, a1.key, a2.key],
        status: 'in_progress',
        priority: 'high',
        dueDate: '2026-11-20',
        addLabels: ['Ops', 'release'],
      });
      expect(result.items.map((item) => item.key)).toEqual([b1.key, a1.key, a2.key]);
      for (const item of result.items) {
        expect(item).toMatchObject({ status: 'in_progress', priority: 'high', dueDate: '2026-11-20' });
      }
      expect(result.items[0]?.labels?.map((label) => label.name)).toEqual(['ops', 'release']);
      expect(result.items[1]?.labels?.map((label) => label.name)).toEqual(['Ops', 'release']);
      // Labels resolve per project.
      expect(result.items[0]?.labels?.[1]?.id).not.toBe(result.items[1]?.labels?.[1]?.id);

      const a2Activity = (await listTaskActivity(ctx, world.memberActor, { key: a2.key })).items;
      expect(a2Activity).toHaveLength(2);
      expect(a2Activity[1]?.changes.map((change) => change.field)).toEqual(['labels', 'dueDate']);
      expect((await listTaskActivity(ctx, world.memberActor, { key: a1.key })).items).toHaveLength(2);

      // The same change again changes nothing and records nothing.
      await bulkUpdateTasks(ctx, world.memberActor, { keys: [a1.key, a2.key], status: 'in_progress' });
      expect((await listTaskActivity(ctx, world.memberActor, { key: a1.key })).items).toHaveLength(2);
    });

    it('is all or nothing', async () => {
      const { key } = await newProject('Bulk rollback');
      const first = await createTask(ctx, world.memberActor, { project: key, title: 'First' });
      const full = await createTask(ctx, world.memberActor, {
        project: key,
        title: 'Full',
        labels: Array.from({ length: 19 }, (_, i) => `l${i}`),
      });
      await expect(
        bulkUpdateTasks(ctx, world.memberActor, {
          keys: [first.key, full.key],
          status: 'done',
          addLabels: ['x', 'y'],
        }),
      ).rejects.toThrow(Invalid);
      await expect(getTask(ctx, world.memberActor, { key: first.key })).resolves.toMatchObject({
        status: 'todo',
        labels: [],
      });
      await expect(
        bulkUpdateTasks(ctx, world.memberActor, { keys: [first.key, `${key}-9999`], status: 'done' }),
      ).rejects.toThrow(NotFound);
      await expect(getTask(ctx, world.memberActor, { key: first.key })).resolves.toMatchObject({
        status: 'todo',
      });
    });

    it('needs one project for a milestone or cycle, and native projects only', async () => {
      const a = await newProject('Bulk one');
      const b = await newProject('Bulk two');
      const a1 = await createTask(ctx, world.memberActor, { project: a.key, title: 'A1' });
      const b1 = await createTask(ctx, world.memberActor, { project: b.key, title: 'B1' });
      const milestone = await createMilestoneRow(ctx.db, scopeOf(a.row), { createdById: world.owner.id });
      await expect(
        bulkUpdateTasks(ctx, world.memberActor, { keys: [a1.key, b1.key], milestone: milestone.id }),
      ).rejects.toThrow(NotSameProject);
      await expect(
        bulkUpdateTasks(ctx, world.memberActor, { keys: [a1.key, b1.key], milestone: null, cycle: null }),
      ).resolves.toMatchObject({ items: [{ key: a1.key }, { key: b1.key }] });
      await expect(
        bulkUpdateTasks(ctx, world.memberActor, { keys: [a1.key], milestone: milestone.id }),
      ).resolves.toMatchObject({ items: [{ milestone: { id: milestone.id } }] });

      const mirror = await createMirroredProject(ctx.db, world);
      const error = await bulkUpdateTasks(ctx, world.memberActor, {
        keys: [a1.key, `${mirror.key}-786`],
        cycle: null,
        priority: 'low',
      }).catch((caught) => caught);
      expect(error).toBeInstanceOf(TaskMirrored);
      expect(error.extensions).toMatchObject({ field: 'priority', backlogId: 'BACK-786' });
      await expect(getTask(ctx, world.memberActor, { key: a1.key })).resolves.toMatchObject({
        priority: 'none',
      });

      const reader = keyActor(world, { projects: 'all', access: 'read' });
      await expect(bulkUpdateTasks(ctx, reader, { keys: [a1.key], status: 'done' })).rejects.toThrow(
        Forbidden,
      );
    });

    it('keeps a fixed number of queries per page with labels and blockers on every row', async () => {
      // Smoke check of the list fields over raw rows (the timing test lives in tasks.perf.test.ts).
      const { key, row } = await newProject('Bulk rows');
      const label = await createLabelRow(ctx.db, scopeOf(row), { name: 'raw' });
      const blocker = await createTaskRow(ctx.db, row.id, { createdById: world.owner.id });
      for (let i = 0; i < 5; i++) {
        const task = await createTaskRow(ctx.db, row.id, { createdById: world.owner.id });
        await addTaskLabels(ctx.db, task.id, [label.id]);
        await addTaskBlockers(ctx.db, task.id, [blocker.id]);
      }
      const page = await listTasks(ctx, world.memberActor, { project: key, blocked: true });
      expect(page.items).toHaveLength(5);
      expect(page.items.every((item) => item.labels?.[0]?.name === 'raw' && item.blocked)).toBe(true);
    });
  });
});

const PRIORITY_VALUES = { none: 0, low: 1, medium: 2, high: 3, urgent: 4 } as const;
function priorityValue(item: TaskListItem): number {
  return PRIORITY_VALUES[item.priority];
}
