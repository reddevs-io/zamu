import type { Project, TASK_STATUSES } from '@pm/contracts';
import { type Db, schema } from '@pm/db';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { listTaskActivity } from './activity';
import {
  addCalendarDays,
  type ClockContext,
  calendarDateIn,
  createCycle,
  cycleStateOn,
  endCycle,
  endDueCycles,
  getCycle,
  isValidTimeZone,
  listCycles,
  nextMonday,
  resolveCycleSelector,
  todayIn,
  updateCycle,
} from './cycles';
import { Conflict, Forbidden, Invalid, NotFound } from './errors';
import { runJob } from './job-handlers';
import { CYCLES_END_DUE } from './jobs';
import { createProject, updateProject } from './projects';
import { createWorld, randomProjectKey, type TestContext, testContext, type World } from './testing/fixtures';

type TaskStatus = (typeof TASK_STATUSES)[number];

/** A clock fixed at `iso` (UTC unless `timeZone` is given). */
function clockAt(iso: string, timeZone = 'UTC'): ClockContext {
  const now = new Date(iso);
  return { timeZone, now: () => now };
}

/** Inserts a task directly, so these tests do not depend on the task service. */
async function insertTask(
  db: Db,
  world: World,
  projectId: string,
  values: {
    status?: TaskStatus;
    cycleId?: string | null;
    milestoneId?: string | null;
    assigneeId?: string | null;
    cycleAddedAt?: Date | null;
  } = {},
) {
  const [row] = await db
    .insert(schema.task)
    .values({
      projectId,
      number: sql`(select coalesce(max(${schema.task.number}), 0) + 1 from ${schema.task} where ${schema.task.projectId} = ${projectId})`,
      title: `Task ${crypto.randomUUID().slice(0, 6)}`,
      createdById: world.owner.id,
      status: values.status ?? 'todo',
      cycleId: values.cycleId ?? null,
      milestoneId: values.milestoneId ?? null,
      assigneeId: values.assigneeId ?? null,
      cycleAddedAt: values.cycleAddedAt ?? null,
    })
    .returning();
  if (!row) throw new Error('task insert failed');
  return row;
}

/** Inserts a cycle directly (any dates, past included). */
async function insertCycle(
  db: Db,
  project: Project,
  workspaceId: string,
  number: number,
  startsOn: string,
  endsOn: string,
) {
  const [row] = await db
    .insert(schema.cycle)
    .values({ workspaceId, projectId: project.id, number, startsOn, endsOn })
    .returning();
  await db
    .update(schema.project)
    .set({ nextCycleNumber: number + 1 })
    .where(eq(schema.project.id, project.id));
  if (!row) throw new Error('cycle insert failed');
  return row;
}

async function taskRow(db: Db, id: string) {
  const [row] = await db.select().from(schema.task).where(eq(schema.task.id, id));
  if (!row) throw new Error('task not found');
  return row;
}

describe('calendar helpers', () => {
  it('computes today in the time zone', () => {
    const at = new Date('2040-01-01T23:30:00Z');
    expect(calendarDateIn('UTC', at)).toBe('2040-01-01');
    expect(calendarDateIn('Asia/Tokyo', at)).toBe('2040-01-02');
    expect(calendarDateIn('America/Los_Angeles', at)).toBe('2040-01-01');
    expect(todayIn(clockAt('2040-01-01T23:30:00Z', 'Asia/Tokyo'))).toBe('2040-01-02');
    expect(todayIn({ now: () => at })).toBe('2040-01-01');
    expect(isValidTimeZone('Europe/Berlin')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
  });

  it('adds days and finds the next Monday', () => {
    expect(addCalendarDays('2040-02-28', 1)).toBe('2040-02-29');
    expect(addCalendarDays('2040-03-01', -1)).toBe('2040-02-29');
    // 2040-01-02 is a Monday.
    expect(nextMonday('2040-01-01')).toBe('2040-01-02');
    expect(nextMonday('2040-01-02')).toBe('2040-01-09');
    expect(nextMonday('2040-01-07')).toBe('2040-01-09');
  });

  it('derives the state from the dates and completedAt', () => {
    const row = { startsOn: '2040-01-02', endsOn: '2040-01-15', completedAt: null };
    expect(cycleStateOn(row, '2040-01-01')).toBe('upcoming');
    expect(cycleStateOn(row, '2040-01-02')).toBe('current');
    expect(cycleStateOn(row, '2040-01-15')).toBe('current');
    // Past its end and not ended yet: the hourly job ends it; it already counts as completed.
    expect(cycleStateOn(row, '2040-01-16')).toBe('completed');
    expect(cycleStateOn({ ...row, completedAt: new Date() }, '2040-01-05')).toBe('completed');
  });
});

describe('cycles', () => {
  let ctx: TestContext;
  let world: World;

  beforeAll(async () => {
    ctx = testContext();
    world = await createWorld(ctx.db);
  });
  afterAll(async () => {
    await ctx?.close();
  });

  async function newProject(w = world) {
    return createProject(ctx, w.ownerActor, { name: 'Payments', key: randomProjectKey() });
  }

  it('creates cycles with defaults from the previous one and numbers them', async () => {
    const project = await newProject();
    // Wednesday 2040-01-04: the first cycle starts next Monday and lasts 14 days.
    const clock = { ...ctx, ...clockAt('2040-01-04T10:00:00Z') };
    const first = await createCycle(clock, world.ownerActor, { project: project.key });
    expect(first).toMatchObject({
      number: 1,
      name: null,
      startsOn: '2040-01-09',
      endsOn: '2040-01-22',
      state: 'upcoming',
      daysLeft: null,
      completedAt: null,
      summary: null,
      rollovers: [],
    });
    expect(first.counts.total).toBe(0);

    const second = await createCycle(clock, world.memberActor, { project: project.key, name: 'Checkout' });
    expect(second).toMatchObject({
      number: 2,
      name: 'Checkout',
      startsOn: '2040-01-23',
      endsOn: '2040-02-05',
    });

    // An explicit start keeps the previous length; an explicit range sets a new one.
    const third = await createCycle(clock, world.ownerActor, {
      project: project.key,
      startsOn: '2040-02-06',
      endsOn: '2040-02-12',
    });
    expect(third).toMatchObject({ number: 3, endsOn: '2040-02-12' });
    const fourth = await createCycle(clock, world.agentActor, {
      project: project.key,
      startsOn: '2040-02-20',
    });
    expect(fourth).toMatchObject({ number: 4, startsOn: '2040-02-20', endsOn: '2040-02-26' });

    const { items } = await listCycles(clock, world.memberActor, { project: project.key });
    expect(items.map((c) => c.number)).toEqual([1, 2, 3, 4]);
  });

  it('starts the default cycle today when the last one ended a while ago', async () => {
    const project = await newProject();
    await createCycle({ ...ctx, ...clockAt('2040-01-02T10:00:00Z') }, world.ownerActor, {
      project: project.key,
      startsOn: '2040-01-02',
      endsOn: '2040-01-08',
    });
    const later = await createCycle({ ...ctx, ...clockAt('2040-03-01T10:00:00Z') }, world.ownerActor, {
      project: project.key,
    });
    expect(later).toMatchObject({
      number: 2,
      startsOn: '2040-03-01',
      endsOn: '2040-03-07',
      state: 'current',
    });
  });

  it('rejects overlapping, too long, past and disabled cycles', async () => {
    const project = await newProject();
    const clock = { ...ctx, ...clockAt('2040-01-04T10:00:00Z') };
    await createCycle(clock, world.ownerActor, {
      project: project.key,
      startsOn: '2040-01-09',
      endsOn: '2040-01-22',
    });

    await expect(
      createCycle(clock, world.ownerActor, {
        project: project.key,
        startsOn: '2040-01-22',
        endsOn: '2040-01-30',
      }),
    ).rejects.toThrow(Conflict);
    await expect(
      createCycle(clock, world.ownerActor, {
        project: project.key,
        startsOn: '2040-01-01',
        endsOn: '2040-01-09',
      }),
    ).rejects.toThrow(/overlap Cycle 1/);
    // The contract checks length when both dates are given; core checks it after the defaults.
    await expect(
      createCycle(clock, world.ownerActor, {
        project: project.key,
        startsOn: '2040-02-01',
        endsOn: '2040-04-01',
      }),
    ).rejects.toThrow(Invalid);
    await expect(
      createCycle(clock, world.ownerActor, { project: project.key, endsOn: '2040-01-20' }),
    ).rejects.toThrow(/End on or after the start date/);
    await expect(
      createCycle(clock, world.ownerActor, {
        project: project.key,
        startsOn: '2039-12-01',
        endsOn: '2039-12-10',
      }),
    ).rejects.toThrow(/cannot end before today/);

    // Nothing above took a number.
    const next = await createCycle(clock, world.ownerActor, { project: project.key });
    expect(next.number).toBe(2);

    await updateProject(ctx, world.ownerActor, { project: project.key, usesCycles: false });
    await expect(createCycle(clock, world.ownerActor, { project: project.key })).rejects.toThrow(
      /does not use cycles/,
    );
    // Reads still work: the data stays.
    expect((await listCycles(clock, world.ownerActor, { project: project.key })).items).toHaveLength(2);
  });

  it('checks key scope and access', async () => {
    const project = await newProject();
    const other = await newProject();
    const clock = { ...ctx, ...clockAt('2040-01-04T10:00:00Z') };
    const readOnly = { ...world.agentActor, scope: { projects: 'all' as const, access: 'read' as const } };
    const scoped = { ...world.agentActor, scope: { projects: [other.id], access: 'write' as const } };
    await expect(createCycle(clock, readOnly, { project: project.key })).rejects.toThrow(Forbidden);
    await expect(createCycle(clock, scoped, { project: project.key })).rejects.toThrow(Forbidden);
    await expect(listCycles(clock, scoped, { project: project.key })).rejects.toThrow(Forbidden);
    await createCycle(clock, world.ownerActor, { project: project.key });
    expect((await listCycles(clock, readOnly, { project: project.key })).items).toHaveLength(1);
    await expect(endCycle(clock, readOnly, { project: project.key, number: 1 })).rejects.toThrow(Forbidden);

    const elsewhere = await createWorld(ctx.db, 'Elsewhere');
    await expect(listCycles(clock, elsewhere.ownerActor, { project: project.key })).rejects.toThrow(NotFound);
  });

  it('resolves current, next and numbers, with state and days left', async () => {
    const project = await newProject();
    const setup = { ...ctx, ...clockAt('2040-01-02T10:00:00Z') };
    await createCycle(setup, world.ownerActor, {
      project: project.key,
      startsOn: '2040-01-02',
      endsOn: '2040-01-15',
    });
    await createCycle(setup, world.ownerActor, { project: project.key });

    const midCycle = clockAt('2040-01-13T10:00:00Z');
    const current = await getCycle({ ...ctx, ...midCycle }, world.memberActor, {
      project: project.key,
      number: 'current',
    });
    expect(current).toMatchObject({ number: 1, state: 'current', daysLeft: 3 });
    const next = await getCycle({ ...ctx, ...midCycle }, world.memberActor, {
      project: project.key,
      number: 'next',
    });
    expect(next).toMatchObject({ number: 2, state: 'upcoming', daysLeft: null });
    const lastDay = await getCycle({ ...ctx, ...clockAt('2040-01-15T23:00:00Z') }, world.memberActor, {
      project: project.key,
      number: '1',
    });
    expect(lastDay.daysLeft).toBe(1);
    // In Tokyo it is already the 16th: the cycle is due.
    const tokyo = await getCycle(
      { ...ctx, ...clockAt('2040-01-15T23:00:00Z', 'Asia/Tokyo') },
      world.memberActor,
      {
        project: project.key,
        number: 1,
      },
    );
    expect(tokyo.state).toBe('completed');

    const { items } = await listCycles({ ...ctx, ...midCycle }, world.memberActor, {
      project: project.key,
      state: 'upcoming',
    });
    expect(items.map((c) => c.number)).toEqual([2]);

    const resolved = await resolveCycleSelector(ctx.db, project.id, 'current', midCycle);
    expect(resolved).toMatchObject({ number: 1, state: 'current' });
    expect(await resolveCycleSelector(ctx.db, project.id, 7, midCycle)).toBeNull();
    // Before any cycle starts there is no current one; next is the earliest upcoming.
    const before = clockAt('2039-12-01T10:00:00Z');
    expect(await resolveCycleSelector(ctx.db, project.id, 'current', before)).toBeNull();
    expect(await resolveCycleSelector(ctx.db, project.id, 'next', before)).toMatchObject({ number: 1 });
    // Without a clock: UTC at the real time, where both cycles are long gone.
    expect(await resolveCycleSelector(ctx.db, project.id, 1)).toMatchObject({ number: 1 });

    await expect(
      getCycle({ ...ctx, ...before }, world.memberActor, { project: project.key, number: 'current' }),
    ).rejects.toThrow(/No current cycle/);
    await expect(
      getCycle({ ...ctx, ...before }, world.memberActor, { project: project.key, number: 9 }),
    ).rejects.toThrow(NotFound);
  });

  it('renames any cycle before it ends and moves dates only while upcoming', async () => {
    const project = await newProject();
    const clock = { ...ctx, ...clockAt('2040-01-05T10:00:00Z') };
    await createCycle(clock, world.ownerActor, {
      project: project.key,
      startsOn: '2040-01-02',
      endsOn: '2040-01-15',
    });
    await createCycle(clock, world.ownerActor, { project: project.key });
    await createCycle(clock, world.ownerActor, { project: project.key });

    const renamed = await updateCycle(clock, world.memberActor, {
      project: project.key,
      number: 'current',
      name: 'Q1',
    });
    expect(renamed).toMatchObject({ number: 1, name: 'Q1' });
    await expect(
      updateCycle(clock, world.memberActor, { project: project.key, number: 1, endsOn: '2040-01-20' }),
    ).rejects.toThrow(/only its name/);

    const moved = await updateCycle(clock, world.memberActor, {
      project: project.key,
      number: 2,
      endsOn: '2040-01-25',
    });
    expect(moved).toMatchObject({ startsOn: '2040-01-16', endsOn: '2040-01-25' });
    await expect(
      updateCycle(clock, world.memberActor, { project: project.key, number: 2, endsOn: '2040-01-31' }),
    ).rejects.toThrow(/overlap Cycle 3/);
    await expect(
      updateCycle(clock, world.memberActor, { project: project.key, number: 2, endsOn: '2040-03-25' }),
    ).rejects.toThrow(Invalid);
    const cleared = await updateCycle(clock, world.memberActor, {
      project: project.key,
      number: 1,
      name: null,
    });
    expect(cleared.name).toBeNull();

    await endCycle(clock, world.memberActor, { project: project.key, number: 1 });
    await expect(
      updateCycle(clock, world.memberActor, { project: project.key, number: 1, name: 'Late' }),
    ).rejects.toThrow(/has ended/);
  });

  it('counts tasks by status, scope added after start, unassigned and agents', async () => {
    const project = await newProject();
    const clock = { ...ctx, ...clockAt('2040-01-05T10:00:00Z', 'Europe/Berlin') };
    const created = await createCycle(clock, world.ownerActor, {
      project: project.key,
      startsOn: '2040-01-02',
      endsOn: '2040-01-15',
    });
    const cycleId = created.id;
    // Midnight of Jan 2 in Berlin is 2040-01-01T23:00Z.
    await insertTask(ctx.db, world, project.id, { cycleId, cycleAddedAt: new Date('2040-01-01T22:00:00Z') });
    await insertTask(ctx.db, world, project.id, {
      cycleId,
      status: 'in_progress',
      assigneeId: world.agent.id,
      cycleAddedAt: new Date('2040-01-01T23:30:00Z'),
    });
    await insertTask(ctx.db, world, project.id, { cycleId, status: 'done', assigneeId: world.member.id });
    await insertTask(ctx.db, world, project.id, { status: 'todo' }); // not in the cycle

    const cycle = await getCycle(clock, world.memberActor, { project: project.key, number: 1 });
    expect(cycle.counts).toEqual({
      backlog: 0,
      todo: 1,
      in_progress: 1,
      in_review: 0,
      done: 1,
      canceled: 0,
      total: 3,
      addedAfterStart: 1,
      unassigned: 1,
      agents: 1,
    });
  });

  it('ends a cycle into a new one of the same length when none is next', async () => {
    const project = await newProject();
    const clock = { ...ctx, ...clockAt('2040-01-10T10:00:00Z') };
    const created = await createCycle(clock, world.ownerActor, {
      project: project.key,
      startsOn: '2040-01-02',
      endsOn: '2040-01-15',
    });
    const cycleId = created.id;
    const start = new Date('2040-01-01T00:00:00Z');
    const todo = await insertTask(ctx.db, world, project.id, { cycleId, cycleAddedAt: start });
    const review = await insertTask(ctx.db, world, project.id, {
      cycleId,
      status: 'in_review',
      cycleAddedAt: new Date('2040-01-05T10:00:00Z'),
    });
    const done = await insertTask(ctx.db, world, project.id, {
      cycleId,
      status: 'done',
      cycleAddedAt: start,
    });
    const canceled = await insertTask(ctx.db, world, project.id, {
      cycleId,
      status: 'canceled',
      cycleAddedAt: start,
    });

    const ended = await endCycle(clock, world.agentActor, { project: project.key, number: 'current' });
    expect(ended).toMatchObject({
      number: 1,
      state: 'completed',
      completedAt: '2040-01-10T10:00:00.000Z',
      endedBy: { id: world.agent.id },
      summary: { scope: 4, completed: 1, rolledOver: 2, canceled: 1, addedAfterStart: 1 },
    });
    // The record keeps the moved tasks; the done and canceled ones stay in the ended cycle.
    expect(ended.counts.total).toBe(2);
    const next = await getCycle(clock, world.memberActor, { project: project.key, number: 2 });
    expect(next).toMatchObject({ startsOn: '2040-01-16', endsOn: '2040-01-29', state: 'upcoming' });
    expect(ended.rollovers).toEqual([
      expect.objectContaining({
        task: expect.objectContaining({ id: todo.id, key: `${project.key}-${todo.number}`, status: 'todo' }),
        statusAtEnd: 'todo',
        movedTo: { id: next.id, number: 2, name: null },
      }),
      expect.objectContaining({ task: expect.objectContaining({ id: review.id }), statusAtEnd: 'in_review' }),
    ]);

    for (const moved of [todo, review]) {
      const row = await taskRow(ctx.db, moved.id);
      expect(row.cycleId).toBe(next.id);
      expect(row.cycleAddedAt?.toISOString()).toBe('2040-01-10T10:00:00.000Z');
      const { items } = await listTaskActivity(ctx, world.ownerActor, {
        key: `${project.key}-${moved.number}`,
      });
      const entry = items.find((a) => a.type === 'cycle.ended');
      expect(entry).toMatchObject({
        actor: { id: world.agent.id },
        onBehalfOf: { id: world.member.id },
        changes: [{ field: 'cycle', from: { id: cycleId, number: 1 }, to: { id: next.id, number: 2 } }],
      });
    }
    expect((await taskRow(ctx.db, done.id)).cycleId).toBe(cycleId);
    expect((await taskRow(ctx.db, canceled.id)).cycleId).toBe(cycleId);

    // Ending it again changes nothing.
    const again = await endCycle({ ...ctx, ...clockAt('2040-01-11T10:00:00Z') }, world.ownerActor, {
      project: project.key,
      number: 1,
    });
    expect(again.completedAt).toBe(ended.completedAt);
    expect(again.endedBy?.id).toBe(world.agent.id);
    const rows = await ctx.db
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(schema.activity)
      .where(and(eq(schema.activity.projectId, project.id), eq(schema.activity.type, 'cycle.ended')));
    expect(rows[0]?.n).toBe(2);
    const cycles = await listCycles(clock, world.memberActor, { project: project.key });
    expect(cycles.items).toHaveLength(2);
  });

  it('ends a cycle into the next upcoming one, a chosen one or none', async () => {
    const project = await newProject();
    const clock = { ...ctx, ...clockAt('2040-01-10T10:00:00Z') };
    const first = await createCycle(clock, world.ownerActor, {
      project: project.key,
      startsOn: '2040-01-02',
      endsOn: '2040-01-15',
    });
    const second = await createCycle(clock, world.ownerActor, { project: project.key });
    const third = await createCycle(clock, world.ownerActor, { project: project.key });
    const a = await insertTask(ctx.db, world, project.id, { cycleId: first.id });

    await endCycle(clock, world.ownerActor, { project: project.key, number: 1 });
    expect((await taskRow(ctx.db, a.id)).cycleId).toBe(second.id);
    expect((await listCycles(clock, world.ownerActor, { project: project.key })).items).toHaveLength(3);

    // Invalid targets leave everything as it was.
    const b = await insertTask(ctx.db, world, project.id, { cycleId: second.id });
    for (const moveTo of [2, 1, 42]) {
      await expect(
        endCycle(clock, world.ownerActor, { project: project.key, number: 2, moveTo }),
      ).rejects.toThrow(Invalid);
    }
    expect(
      (await getCycle(clock, world.ownerActor, { project: project.key, number: 2 })).completedAt,
    ).toBeNull();
    expect((await taskRow(ctx.db, b.id)).cycleId).toBe(second.id);

    const skipped = await endCycle(clock, world.ownerActor, { project: project.key, number: 2, moveTo: 3 });
    expect(skipped.rollovers.map((r) => r.movedTo?.number)).toEqual([3, 3]);
    expect((await taskRow(ctx.db, b.id)).cycleId).toBe(third.id);

    const none = await endCycle(clock, world.ownerActor, { project: project.key, number: 3, moveTo: 'none' });
    expect(none.rollovers.map((r) => r.movedTo)).toEqual([null, null]);
    expect((await taskRow(ctx.db, a.id)).cycleId).toBeNull();
    const { items } = await listTaskActivity(ctx, world.ownerActor, { key: `${project.key}-${a.number}` });
    expect(items.filter((x) => x.type === 'cycle.ended').map((x) => x.changes[0])).toEqual([
      {
        field: 'cycle',
        from: expect.objectContaining({ number: 1 }),
        to: expect.objectContaining({ number: 2 }),
      },
      {
        field: 'cycle',
        from: expect.objectContaining({ number: 2 }),
        to: expect.objectContaining({ number: 3 }),
      },
      { field: 'cycle', from: expect.objectContaining({ number: 3 }), to: null },
    ]);
  });

  it('ends a cycle once when two requests race', async () => {
    const project = await newProject();
    const clock = { ...ctx, ...clockAt('2040-01-10T10:00:00Z') };
    const created = await createCycle(clock, world.ownerActor, {
      project: project.key,
      startsOn: '2040-01-02',
      endsOn: '2040-01-15',
    });
    await insertTask(ctx.db, world, project.id, { cycleId: created.id });
    await Promise.all([
      endCycle(clock, world.ownerActor, { project: project.key, number: 1 }),
      endCycle(clock, world.memberActor, { project: project.key, number: 1 }),
    ]);
    const { items } = await listCycles(clock, world.ownerActor, { project: project.key });
    expect(items).toHaveLength(2);
    const rollovers = await ctx.db
      .select()
      .from(schema.cycleRollover)
      .where(eq(schema.cycleRollover.cycleId, created.id));
    expect(rollovers).toHaveLength(1);
  });
});

describe('cycles.end-due job', () => {
  let ctx: TestContext;
  let world: World;

  beforeAll(async () => {
    ctx = testContext();
    world = await createWorld(ctx.db);
  });
  afterAll(async () => {
    await ctx?.close();
  });

  // Dates in the 1990s: no other test has cycles that early, so the job only touches these.
  it('ends only due cycles, as the system, and skips ended ones and projects without cycles', async () => {
    const project = await createProject(ctx, world.ownerActor, { name: 'Due', key: randomProjectKey() });
    const due = await insertCycle(ctx.db, project, world.workspaceId, 1, '1990-01-01', '1990-01-14');
    const current = await insertCycle(ctx.db, project, world.workspaceId, 2, '1990-01-15', '1990-01-28');
    const task = await insertTask(ctx.db, world, project.id, { cycleId: due.id, status: 'in_progress' });
    await insertTask(ctx.db, world, project.id, { cycleId: due.id, status: 'done' });

    const off = await createProject(ctx, world.ownerActor, { name: 'Off', key: randomProjectKey() });
    const offCycle = await insertCycle(ctx.db, off, world.workspaceId, 1, '1990-01-01', '1990-01-14');
    await updateProject(ctx, world.ownerActor, { project: off.key, usesCycles: false });

    // Jan 15 at 02:00 UTC is still Jan 14 in Los Angeles: nothing is due there yet.
    const early = await runJob({ ...ctx, timeZone: 'America/Los_Angeles' }, CYCLES_END_DUE, {
      now: '1990-01-15T02:00:00Z',
    });
    expect(early).toEqual({ ended: 0 });

    const result = await runJob(ctx, CYCLES_END_DUE, { now: '1990-01-15T00:30:00Z' });
    expect(result).toEqual({ ended: 1 });
    const clock = { ...ctx, ...clockAt('1990-01-15T00:30:00Z') };
    const ended = await getCycle(clock, world.ownerActor, { project: project.key, number: 1 });
    expect(ended).toMatchObject({
      state: 'completed',
      endedBy: null,
      completedAt: '1990-01-15T00:30:00.000Z',
      summary: { scope: 2, completed: 1, rolledOver: 1 },
    });
    expect(ended.rollovers.map((r) => r.movedTo?.id)).toEqual([current.id]);
    expect((await taskRow(ctx.db, task.id)).cycleId).toBe(current.id);
    const { items } = await listTaskActivity(ctx, world.ownerActor, { key: `${project.key}-${task.number}` });
    expect(items.find((a) => a.type === 'cycle.ended')).toMatchObject({ actor: null, onBehalfOf: null });

    // Second run: nothing left to end. The other project's cycle waits until cycles are back on.
    expect(await endDueCycles({ ...ctx, ...clockAt('1990-01-15T01:30:00Z') })).toEqual({ ended: 0 });
    const [offRow] = await ctx.db.select().from(schema.cycle).where(eq(schema.cycle.id, offCycle.id));
    expect(offRow?.completedAt).toBeNull();

    // Once the current cycle is due too, it ends into a new one of the same length.
    expect(await endDueCycles({ ...ctx, ...clockAt('1990-01-29T00:10:00Z') })).toEqual({ ended: 1 });
    const { items: cycles } = await listCycles(clock, world.ownerActor, { project: project.key });
    expect(cycles.map((c) => [c.number, c.startsOn, c.endsOn])).toEqual([
      [1, '1990-01-01', '1990-01-14'],
      [2, '1990-01-15', '1990-01-28'],
      [3, '1990-01-29', '1990-02-11'],
    ]);
    expect((await taskRow(ctx.db, task.id)).cycleId).toBe(cycles[2]?.id);
  });
});
