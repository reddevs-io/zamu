import type { Dashboard, DashboardScope } from '@pm/contracts';
import { schema } from '@pm/db';
import { and, asc, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Actor } from './authz';
import { createComment, deleteComment } from './comments';
import { addCalendarDays, type ClockContext, todayIn } from './cycles';
import {
  getDashboard,
  getDashboardCounts,
  MENTION_EXCERPT_LENGTH,
  mentionExcerpt,
  QUEUE_ITEM_LIMIT,
} from './dashboard';
import { formatMention } from './mentions';
import { createProject, updateProject } from './projects';
import { createTask, updateTask } from './tasks';
import {
  createCommentRow,
  createCycleRow,
  createMilestoneRow,
  createTaskRow,
  createUser,
  createWorld,
  projectRow,
  randomProjectKey,
  scopeOf,
  type TestContext,
  testContext,
  type World,
} from './testing/fixtures';

const HOUR = 3_600_000;
const { activity, member, project, task } = schema;

let ctx: TestContext;

beforeAll(() => {
  ctx = testContext();
});
afterAll(async () => {
  await ctx?.close();
});

/** The test context with the clock `hours` away from the real now, in UTC. */
function clock(hours = 0): TestContext & ClockContext {
  const now = new Date(Date.now() + hours * HOUR);
  return { ...ctx, timeZone: 'UTC', now: () => now };
}

function dashboard(actor: Actor, scope: DashboardScope = 'mine', hours = 0): Promise<Dashboard> {
  return getDashboard(clock(hours), actor, { scope });
}

type ProjectRow = Awaited<ReturnType<typeof projectRow>>;

async function newProject(world: World, name?: string): Promise<ProjectRow> {
  const key = randomProjectKey();
  await createProject(ctx, world.ownerActor, { key, name: name ?? `Project ${key}` });
  return projectRow(ctx.db, world.workspaceId, key);
}

/** A raw task row in `p`, created by the owner. */
function rawTask(world: World, p: ProjectRow, values: Partial<typeof task.$inferInsert> = {}) {
  return createTaskRow(ctx.db, p.id, { createdById: world.owner.id, ...values });
}

const keyOf = (p: ProjectRow, row: { number: number }) => `${p.key}-${row.number}`;
const keys = (items: { task: { key: string } }[]) => items.map((item) => item.task.key);
const ago = (hours: number) => new Date(Date.now() - hours * HOUR);
const mention = (user: { id: string; name: string }) => formatMention(user.name, user.id);

async function taskIdOf(world: World, key: string): Promise<string> {
  const [projectKey, number] = key.split('-') as [string, string];
  const [row] = await ctx.db
    .select({ id: task.id })
    .from(task)
    .innerJoin(project, eq(project.id, task.projectId))
    .where(
      and(
        eq(project.workspaceId, world.workspaceId),
        eq(project.key, projectKey),
        eq(task.number, Number(number)),
      ),
    );
  if (!row) throw new Error(`task ${key} not found`);
  return row.id;
}

async function setUpdatedAt(world: World, key: string, at: Date) {
  await ctx.db
    .update(task)
    .set({ updatedAt: at })
    .where(eq(task.id, await taskIdOf(world, key)));
}

/** A person actor using an API key with this scope. */
function personKey(actor: Actor, scope: NonNullable<Actor['scope']>): Actor {
  return { ...actor, scope, apiKeyId: crypto.randomUUID() };
}

// ---------------------------------------------------------------------------

describe('mentionExcerpt', () => {
  const id = '0192f3a0-0000-7000-8000-000000000001';

  it('turns mention links into @Name', () => {
    expect(mentionExcerpt(`${mention({ id, name: 'Ana [ops] Ruiz' })} can you check the retries?`)).toBe(
      '@Ana [ops] Ruiz can you check the retries?',
    );
  });

  it('keeps inline code with its backticks and reads nothing inside it', () => {
    expect(mentionExcerpt('Is `retry_after` read? Not `[@X](mention:abc)` though')).toBe(
      'Is `retry_after` read? Not `[@X](mention:abc)` though',
    );
  });

  it('replaces fenced code with [code] and collapses block elements to single spaces', () => {
    const body = [
      '# Heading',
      '',
      '> quoted **bold** and _em_ text',
      '',
      '- first item',
      '1. numbered [link text](https://example.com) - mid-line dash',
      '',
      '```ts',
      'const secret = 1;',
      '```',
      '---',
      'After \\*not emphasis\\* and snake_case_name <https://example.com/x>',
      '~~~',
      'unclosed fence',
    ].join('\n');
    expect(mentionExcerpt(body)).toBe(
      'Heading quoted bold and em text first item numbered link text - mid-line dash [code] After ' +
        '*not emphasis* and snake_case_name https://example.com/x [code]',
    );
  });

  it('cuts long text at a word boundary with an ellipsis', () => {
    const words = Array.from({ length: 80 }, (_, i) => `word${i}`).join(' ');
    const excerpt = mentionExcerpt(words);
    expect(excerpt.endsWith('…')).toBe(true);
    const text = excerpt.slice(0, -1);
    expect(text.length).toBeLessThanOrEqual(MENTION_EXCERPT_LENGTH);
    expect(text.length).toBeGreaterThan(MENTION_EXCERPT_LENGTH - 10);
    expect(words.startsWith(text)).toBe(true);
    expect(words[text.length]).toBe(' ');
    // Exactly at the limit: no ellipsis. One long word: cut inside it.
    expect(mentionExcerpt('y'.repeat(MENTION_EXCERPT_LENGTH))).toBe('y'.repeat(MENTION_EXCERPT_LENGTH));
    expect(mentionExcerpt('x'.repeat(250))).toBe(`${'x'.repeat(MENTION_EXCERPT_LENGTH)}…`);
  });
});

// ---------------------------------------------------------------------------

describe('In review', () => {
  let world: World;
  let p: ProjectRow;

  beforeAll(async () => {
    world = await createWorld(ctx.db);
    p = await newProject(world);
  });

  it('Mine: tasks of mine and my agents, by priority then longest wait; Everyone: every task', async () => {
    const me = world.memberActor;
    const mine = await createTask(ctx, me, {
      project: p.key,
      title: 'Mine, medium',
      status: 'in_review',
      priority: 'medium',
      assignee: world.member.id,
    });
    const agents = await createTask(ctx, world.agentActor, {
      project: p.key,
      title: 'My agent, urgent',
      status: 'in_progress',
      priority: 'urgent',
      assignee: world.agent.id,
    });
    await updateTask(ctx, world.agentActor, { key: agents.key, status: 'in_review' });
    const older = await createTask(ctx, me, {
      project: p.key,
      title: 'Mine, medium, waiting longer',
      status: 'in_review',
      priority: 'medium',
      assignee: world.member.id,
    });
    await ctx.db
      .update(activity)
      .set({ createdAt: ago(5) })
      .where(eq(activity.taskId, await taskIdOf(world, older.key)));
    const owners = await createTask(ctx, world.ownerActor, {
      project: p.key,
      title: "Owner's",
      status: 'in_review',
      assignee: world.owner.id,
    });
    const nobody = await createTask(ctx, world.ownerActor, {
      project: p.key,
      title: 'Nobody',
      status: 'in_review',
    });
    await createTask(ctx, me, { project: p.key, title: 'Todo', assignee: world.member.id });

    const result = await dashboard(me);
    expect(result.scope).toBe('mine');
    expect(keys(result.groups.review.items)).toEqual([agents.key, older.key, mine.key]);
    expect(result.groups.review.total).toBe(3);
    expect(result.groups.review.items[0]).toEqual({
      task: {
        key: agents.key,
        title: 'My agent, urgent',
        status: 'in_review',
        priority: 'urgent',
        project: { key: p.key, name: p.name },
      },
      assignee: {
        id: world.agent.id,
        name: world.agent.name,
        kind: 'agent',
        responsible: { id: world.member.id, name: world.member.name, kind: 'person' },
      },
      since: expect.any(String),
    });

    const everyone = await dashboard(me, 'everyone');
    expect(everyone.scope).toBe('everyone');
    expect(everyone.groups.review.total).toBe(5);
    expect(keys(everyone.groups.review.items)).toEqual(
      expect.arrayContaining([agents.key, older.key, mine.key, owners.key, nobody.key]),
    );
    expect(everyone.groups.review.items.find((i) => i.task.key === nobody.key)?.assignee).toBeNull();
  });

  it('dates `since` from the newest move to In review, else updated_at, and drops tasks that leave review', async () => {
    const me = world.ownerActor;
    const moved = await createTask(ctx, me, {
      project: p.key,
      title: 'Moved',
      status: 'in_progress',
      assignee: world.owner.id,
    });
    await updateTask(ctx, me, { key: moved.key, status: 'in_review' });
    // A later rename is not a move to In review.
    await updateTask(ctx, me, { key: moved.key, title: 'Moved, renamed' });
    const raw = await rawTask(world, p, {
      status: 'in_review',
      assigneeId: world.owner.id,
      updatedAt: new Date('2026-01-02T03:04:05Z'),
    });

    const entries = await ctx.db
      .select({ createdAt: activity.createdAt })
      .from(activity)
      .where(eq(activity.taskId, await taskIdOf(world, moved.key)))
      .orderBy(asc(activity.createdAt));
    expect(entries).toHaveLength(3);
    const items = (await dashboard(me)).groups.review.items;
    const since = (key: string) => items.find((item) => item.task.key === key)?.since;
    expect(since(moved.key)).toBe(entries[1]?.createdAt.toISOString());
    expect(since(keyOf(p, raw))).toBe('2026-01-02T03:04:05.000Z');

    await updateTask(ctx, me, { key: moved.key, status: 'done' });
    expect(keys((await dashboard(me)).groups.review.items)).not.toContain(moved.key);
  });
});

// ---------------------------------------------------------------------------

describe('Mentions', () => {
  let world: World;
  let p: ProjectRow;

  beforeAll(async () => {
    world = await createWorld(ctx.db);
    p = await newProject(world);
  });

  const openTask = (title: string) => createTask(ctx, world.ownerActor, { project: p.key, title });

  it('Mine: mentions of me by others; Everyone: mentions of any member', async () => {
    const asks = await openTask('Agent asks');
    const question = await createComment(ctx, world.agentActor, {
      key: asks.key,
      body: `${mention(world.member)} should 429 count as an attempt?`,
    });
    const other = await openTask('Member asks the owner');
    await createComment(ctx, world.memberActor, {
      key: other.key,
      body: `${mention(world.owner)} ok to merge?`,
    });

    const mine = await dashboard(world.memberActor);
    expect(mine.groups.mentions.total).toBe(1);
    expect(mine.groups.mentions.items).toEqual([
      {
        task: {
          key: asks.key,
          title: 'Agent asks',
          status: 'todo',
          priority: 'none',
          project: { key: p.key, name: p.name },
        },
        comment: {
          id: question.id,
          excerpt: `@${world.member.name} should 429 count as an attempt?`,
          createdAt: question.createdAt,
        },
        author: { id: world.agent.id, name: world.agent.name, kind: 'agent' },
        onBehalfOf: { id: world.member.id, name: world.member.name, kind: 'person' },
        mentioned: { id: world.member.id, name: world.member.name, kind: 'person', responsible: null },
      },
    ]);
    expect(keys((await dashboard(world.ownerActor)).groups.mentions.items)).toEqual([other.key]);

    const everyone = await dashboard(world.agentActor, 'everyone');
    expect(keys(everyone.groups.mentions.items)).toEqual([other.key, asks.key]); // newest first
  });

  it('a reply by the mentioned person clears it; a reply by their agent does not', async () => {
    const t = await openTask('Reply');
    await createComment(ctx, world.ownerActor, { key: t.key, body: `${mention(world.member)} thoughts?` });
    await createComment(ctx, world.agentActor, { key: t.key, body: 'I can take this.' });
    expect(keys((await dashboard(world.memberActor)).groups.mentions.items)).toContain(t.key);

    await createComment(ctx, world.memberActor, { key: t.key, body: 'Yes, go ahead.' });
    expect(keys((await dashboard(world.memberActor)).groups.mentions.items)).not.toContain(t.key);
  });

  it('a task update by the mentioned person clears it; one by someone else does not', async () => {
    const t = await openTask('Update');
    await createComment(ctx, world.ownerActor, { key: t.key, body: `${mention(world.member)} priority?` });
    await updateTask(ctx, world.ownerActor, { key: t.key, priority: 'low' });
    expect(keys((await dashboard(world.memberActor)).groups.mentions.items)).toContain(t.key);

    await updateTask(ctx, world.memberActor, { key: t.key, priority: 'high' });
    expect(keys((await dashboard(world.memberActor)).groups.mentions.items)).not.toContain(t.key);
  });

  it('ignores self-mentions, deleted comments and tasks that are done or canceled', async () => {
    const self = await openTask('Self');
    await createComment(ctx, world.memberActor, { key: self.key, body: `Note to ${mention(world.member)}` });
    const deleted = await openTask('Deleted');
    const gone = await createComment(ctx, world.ownerActor, {
      key: deleted.key,
      body: `${mention(world.member)}?`,
    });
    await deleteComment(ctx, world.ownerActor, { id: gone.id });
    const done = await openTask('Done');
    await createComment(ctx, world.ownerActor, { key: done.key, body: `${mention(world.member)}?` });
    await updateTask(ctx, world.ownerActor, { key: done.key, status: 'done' });
    const canceled = await openTask('Canceled');
    await createComment(ctx, world.ownerActor, { key: canceled.key, body: `${mention(world.member)}?` });
    await updateTask(ctx, world.ownerActor, { key: canceled.key, status: 'canceled' });

    const items = keys((await dashboard(world.memberActor, 'everyone')).groups.mentions.items);
    for (const t of [self, deleted, done, canceled]) expect(items).not.toContain(t.key);
  });

  it('shows one item per task and person: the newest unanswered mention', async () => {
    const t = await openTask('Thread');
    await createComment(ctx, world.ownerActor, { key: t.key, body: `${mention(world.member)} first` });
    await createComment(ctx, world.memberActor, { key: t.key, body: 'Answered.' });
    const second = await createComment(ctx, world.ownerActor, {
      key: t.key,
      body: `${mention(world.member)} second`,
    });
    const third = await createComment(ctx, world.agentActor, {
      key: t.key,
      body: `${mention(world.member)} and ${mention(world.owner)} third`,
    });
    void second;

    const mine = (await dashboard(world.memberActor)).groups.mentions.items.filter(
      (i) => i.task.key === t.key,
    );
    expect(mine.map((i) => i.comment.id)).toEqual([third.id]);
    const everyone = (await dashboard(world.memberActor, 'everyone')).groups.mentions.items.filter(
      (i) => i.task.key === t.key,
    );
    expect(everyone.map((i) => [i.comment.id, i.mentioned.id]).sort()).toEqual(
      [
        [third.id, world.member.id],
        [third.id, world.owner.id],
      ].sort(),
    );
  });
});

// ---------------------------------------------------------------------------

describe('Stalled', () => {
  let world: World;
  let p: ProjectRow;
  const tasks = {} as Record<'agent' | 'person' | 'nobody' | 'owner', string>;

  beforeAll(async () => {
    world = await createWorld(ctx.db);
    p = await newProject(world);
    const add = async (title: string, assignee: string | null, hoursAgo: number) => {
      const row = await rawTask(world, p, {
        title,
        status: 'in_progress',
        assigneeId: assignee,
        updatedAt: ago(hoursAgo),
      });
      return keyOf(p, row);
    };
    tasks.agent = await add('Agent', world.agent.id, 3);
    tasks.person = await add('Person', world.member.id, 2);
    tasks.nobody = await add('Nobody', null, 1);
    tasks.owner = await add('Owner', world.owner.id, 1);
    await rawTask(world, p, {
      title: 'In review',
      status: 'in_review',
      assigneeId: world.agent.id,
      updatedAt: ago(500),
    });
  });

  it('uses 24 hours for agents and 5 days for people and unassigned tasks, on the injected clock', async () => {
    const me = world.memberActor;
    expect((await dashboard(me, 'everyone', 20)).groups.stalled.total).toBe(0);

    const day = await dashboard(me, 'mine', 22);
    expect(keys(day.groups.stalled.items)).toEqual([tasks.agent]);
    expect(day.groups.stalled.items[0]).toMatchObject({
      thresholdHours: 24,
      assignee: { id: world.agent.id, responsible: { id: world.member.id } },
    });

    expect(keys((await dashboard(me, 'mine', 117)).groups.stalled.items)).toEqual([tasks.agent]);
    const week = await dashboard(me, 'mine', 119.5);
    expect(keys(week.groups.stalled.items)).toEqual([tasks.agent, tasks.person]); // longest silence first
    expect(week.groups.stalled.items[1]?.thresholdHours).toBe(120);

    const everyone = await dashboard(me, 'everyone', 125);
    expect(keys(everyone.groups.stalled.items)).toEqual([
      tasks.agent,
      tasks.person,
      tasks.nobody,
      tasks.owner,
    ]);
    expect(everyone.groups.stalled.items[2]).toMatchObject({ assignee: null, thresholdHours: 120 });
  });

  it('leaves on a newer comment, an update or a status change; lastTouchedAt counts comments', async () => {
    const me = world.memberActor;
    const comment = await createCommentRow(ctx.db, scopeOf(p), {
      taskId: await taskIdOf(world, tasks.agent),
      authorId: world.agent.id,
      createdAt: new Date(Date.now() + 2 * HOUR),
    });
    expect(keys((await dashboard(me, 'mine', 25)).groups.stalled.items)).not.toContain(tasks.agent);
    const later = await dashboard(me, 'mine', 27);
    expect(later.groups.stalled.items.find((i) => i.task.key === tasks.agent)?.lastTouchedAt).toBe(
      comment.createdAt.toISOString(),
    );

    await setUpdatedAt(world, tasks.person, ago(200));
    expect(keys((await dashboard(me)).groups.stalled.items)).toEqual([tasks.person]);
    await updateTask(ctx, me, { key: tasks.person, title: 'Person, touched' });
    expect((await dashboard(me)).groups.stalled.total).toBe(0);

    await setUpdatedAt(world, tasks.owner, ago(200));
    expect(keys((await dashboard(me, 'everyone')).groups.stalled.items)).toEqual([tasks.owner]);
    await ctx.db
      .update(task)
      .set({ status: 'in_review', updatedAt: ago(200) })
      .where(eq(task.id, await taskIdOf(world, tasks.owner)));
    expect((await dashboard(me, 'everyone')).groups.stalled.total).toBe(0);
  });
});

// ---------------------------------------------------------------------------

describe('Deadlines', () => {
  let world: World;
  let today: string;
  const day = (n: number) => addCalendarDays(today, n);

  beforeAll(async () => {
    world = await createWorld(ctx.db);
    today = todayIn(clock());
  });

  it('lists overdue milestones and cycles ending within 2 days that have open tasks, most urgent first', async () => {
    const me = world.memberActor;
    const p = await newProject(world, 'Milestones');
    const milestone = (values: Partial<typeof schema.milestone.$inferInsert>) =>
      createMilestoneRow(ctx.db, scopeOf(p), { createdById: world.owner.id, ...values });
    const late3 = await milestone({ name: 'Late 3', targetDate: day(-3), status: 'active' });
    await rawTask(world, p, { milestoneId: late3.id, assigneeId: world.agent.id });
    await rawTask(world, p, { milestoneId: late3.id, status: 'done' });
    await rawTask(world, p, { milestoneId: late3.id, status: 'canceled', assigneeId: world.member.id });
    const late1 = await milestone({ name: 'Late 1, owner only', targetDate: day(-1) });
    await rawTask(world, p, { milestoneId: late1.id, status: 'in_progress', assigneeId: world.owner.id });
    await rawTask(world, p, { milestoneId: late1.id, status: 'done', assigneeId: world.member.id });
    const completed = await milestone({ name: 'Completed', targetDate: day(-5), status: 'completed' });
    await rawTask(world, p, { milestoneId: completed.id, assigneeId: world.member.id });
    const noOpen = await milestone({ name: 'Nothing open', targetDate: day(-2) });
    await rawTask(world, p, { milestoneId: noOpen.id, status: 'done', assigneeId: world.member.id });
    const dueToday = await milestone({ name: 'Due today', targetDate: today });
    await rawTask(world, p, { milestoneId: dueToday.id, assigneeId: world.member.id });
    const undated = await milestone({ name: 'Undated' });
    await rawTask(world, p, { milestoneId: undated.id, assigneeId: world.member.id });

    const off = await newProject(world, 'Milestones off');
    const hidden = await createMilestoneRow(ctx.db, scopeOf(off), {
      createdById: world.owner.id,
      targetDate: day(-4),
    });
    await rawTask(world, off, { milestoneId: hidden.id, assigneeId: world.member.id });
    await updateProject(ctx, world.ownerActor, {
      project: off.key,
      usesMilestones: false,
      usesCycles: false,
    });
    const hiddenCycle = await createCycleRow(ctx.db, scopeOf(off), { startsOn: day(-3), endsOn: today });
    await rawTask(world, off, { cycleId: hiddenCycle.id, assigneeId: world.member.id });

    const cycleIn = async (name: string, endsIn: number, assigneeId: string | null) => {
      const cp = await newProject(world, name);
      const c = await createCycleRow(ctx.db, scopeOf(cp), { name, startsOn: day(-5), endsOn: day(endsIn) });
      await rawTask(world, cp, { cycleId: c.id, assigneeId });
      return { project: cp, cycle: c };
    };
    const endsToday = await cycleIn('Ends today', 0, world.member.id);
    await rawTask(world, endsToday.project, { cycleId: endsToday.cycle.id, status: 'done' });
    await rawTask(world, endsToday.project, { cycleId: endsToday.cycle.id, status: 'canceled' });
    const inTwo = await cycleIn('Ends in 2 days', 2, world.agent.id);
    await cycleIn('Ends in 3 days', 3, world.member.id);
    const ownerOnly = await cycleIn('Owner only', 1, world.owner.id);
    const emptyCycle = await cycleIn('Nothing open', 1, world.member.id);
    await ctx.db.update(task).set({ status: 'done' }).where(eq(task.cycleId, emptyCycle.cycle.id));
    const ended = await cycleIn('Ended early', 1, world.member.id);
    await ctx.db
      .update(schema.cycle)
      .set({ completedAt: new Date() })
      .where(eq(schema.cycle.id, ended.cycle.id));

    const mine = (await dashboard(me)).groups.deadlines;
    expect(mine.total).toBe(3);
    expect(mine.items).toEqual([
      {
        kind: 'milestone',
        project: { key: p.key, name: 'Milestones' },
        milestone: { id: late3.id, name: 'Late 3', targetDate: day(-3) },
        daysOverdue: 3,
        openTasks: 1,
        progress: { done: 1, total: 2 },
      },
      {
        kind: 'cycle',
        project: { key: endsToday.project.key, name: 'Ends today' },
        cycle: { number: endsToday.cycle.number, name: 'Ends today', startsOn: day(-5), endsOn: today },
        daysLeft: 1,
        openTasks: 1,
        progress: { done: 1, total: 3 },
      },
      expect.objectContaining({
        kind: 'cycle',
        project: { key: inTwo.project.key, name: 'Ends in 2 days' },
        daysLeft: 3,
      }),
    ]);

    const everyone = (await dashboard(me, 'everyone')).groups.deadlines;
    expect(
      everyone.items.map((item) => (item.kind === 'milestone' ? item.milestone.name : item.cycle.name)),
    ).toEqual(['Late 3', 'Late 1, owner only', 'Ends today', 'Owner only', 'Ends in 2 days']);
    expect(everyone.items[1]).toMatchObject({
      daysOverdue: 1,
      openTasks: 1,
      progress: { done: 1, total: 2 },
    });

    // Completing the milestone or moving its date clears it.
    await ctx.db
      .update(schema.milestone)
      .set({ status: 'completed' })
      .where(eq(schema.milestone.id, late3.id));
    await ctx.db
      .update(schema.milestone)
      .set({ targetDate: day(1) })
      .where(eq(schema.milestone.id, late1.id));
    const after = (await dashboard(me, 'everyone')).groups.deadlines.items;
    expect(after.every((item) => item.kind === 'cycle')).toBe(true);
    void ownerOnly;
  });
});

// ---------------------------------------------------------------------------

describe('scope, keys and counts', () => {
  let world: World;
  let a: ProjectRow;
  let b: ProjectRow;

  beforeAll(async () => {
    world = await createWorld(ctx.db);
    a = await newProject(world, 'A');
    b = await newProject(world, 'B');
    await rawTask(world, a, { status: 'in_review', assigneeId: world.member.id });
    await rawTask(world, b, { status: 'in_review', assigneeId: world.member.id });
    await rawTask(world, b, { status: 'in_review', assigneeId: world.agent.id });
    const asked = await rawTask(world, b, { assigneeId: world.member.id });
    await createComment(ctx, world.ownerActor, { key: keyOf(b, asked), body: `${mention(world.member)}?` });
    await rawTask(world, a, { status: 'in_progress', assigneeId: world.agent.id, updatedAt: ago(30) });
    const c = await createCycleRow(ctx.db, scopeOf(a), {
      startsOn: addCalendarDays(todayIn(clock()), -3),
      endsOn: todayIn(clock()),
    });
    await rawTask(world, a, { cycleId: c.id, assigneeId: world.member.id });
  });

  it('a key scoped to one project hides the others, and a read-only key works', async () => {
    const key = personKey(world.memberActor, { projects: [a.id], access: 'read' });
    const scoped = await dashboard(key, 'everyone');
    expect(scoped.projects.map((row) => row.key)).toEqual([a.key]);
    expect(scoped.groups.review.items.map((i) => i.task.project.key)).toEqual([a.key]);
    expect(scoped.groups.mentions.total).toBe(0);
    expect(scoped.groups.stalled.total).toBe(1);
    expect(scoped.groups.deadlines.total).toBe(1);
    expect(await getDashboardCounts(clock(), key)).toEqual({
      review: 1,
      mentions: 0,
      stalled: 1,
      deadlines: 1,
      total: 3,
    });

    const none = await dashboard(personKey(world.memberActor, { projects: [], access: 'read' }));
    expect(none.projects).toEqual([]);
    expect(none.groups.review).toEqual({ total: 0, items: [] });
  });

  it('for an agent key, Mine is the agent itself', async () => {
    const result = await dashboard(world.agentActor);
    expect(result.groups.review.items.map((i) => i.assignee?.id)).toEqual([world.agent.id]);
    expect(result.groups.stalled.total).toBe(1);
    expect(result.groups.mentions.total).toBe(0);
    expect(result.agents).toEqual([]);
  });

  it('the counts equal the Mine totals', async () => {
    const mine = await dashboard(world.memberActor);
    const counts = await getDashboardCounts(clock(), world.memberActor);
    const { review, mentions, stalled, deadlines } = mine.groups;
    expect(counts).toEqual({
      review: review.total,
      mentions: mentions.total,
      stalled: stalled.total,
      deadlines: deadlines.total,
      total: review.total + mentions.total + stalled.total + deadlines.total,
    });
    expect(counts).toEqual({ review: 3, mentions: 1, stalled: 1, deadlines: 1, total: 6 });
  });

  it('defaults to Mine when the input is omitted', async () => {
    expect((await getDashboard(clock(), world.memberActor)).scope).toBe('mine');
  });
});

describe('the item cap', () => {
  it(`returns ${QUEUE_ITEM_LIMIT} items and the uncapped total`, async () => {
    const world = await createWorld(ctx.db);
    const p = await newProject(world);
    for (let i = 0; i < QUEUE_ITEM_LIMIT + 5; i++) {
      await rawTask(world, p, { status: 'in_review', assigneeId: world.member.id, priority: i % 5 });
    }
    const result = await dashboard(world.memberActor);
    expect(result.groups.review.total).toBe(QUEUE_ITEM_LIMIT + 5);
    expect(result.groups.review.items).toHaveLength(QUEUE_ITEM_LIMIT);
    expect(result.groups.review.items[0]?.task.priority).toBe('urgent');
    expect((await getDashboardCounts(clock(), world.memberActor)).review).toBe(QUEUE_ITEM_LIMIT + 5);
  });
});

// ---------------------------------------------------------------------------

describe('project rows', () => {
  it('lists every project, most recently active first, with the current cycle and next milestone', async () => {
    const world = await createWorld(ctx.db);
    const today = todayIn(clock());
    const day = (n: number) => addCalendarDays(today, n);
    const quiet = await newProject(world, 'Quiet');
    const busy = await newProject(world, 'Busy');
    const off = await newProject(world, 'Off');
    await ctx.db
      .update(project)
      .set({ updatedAt: ago(10) })
      .where(eq(project.id, quiet.id));
    await ctx.db
      .update(project)
      .set({ updatedAt: ago(9) })
      .where(eq(project.id, busy.id));

    const c = await createCycleRow(ctx.db, scopeOf(busy), {
      name: 'Sprint',
      startsOn: day(-2),
      endsOn: day(4),
    });
    const next = await createMilestoneRow(ctx.db, scopeOf(busy), {
      createdById: world.owner.id,
      name: 'Next',
      targetDate: day(5),
    });
    await createMilestoneRow(ctx.db, scopeOf(busy), {
      createdById: world.owner.id,
      name: 'Later',
      targetDate: day(10),
    });
    await createMilestoneRow(ctx.db, scopeOf(busy), { createdById: world.owner.id, name: 'Someday' });
    await createMilestoneRow(ctx.db, scopeOf(busy), {
      createdById: world.owner.id,
      name: 'Shipped',
      targetDate: day(1),
      status: 'completed',
    });
    await rawTask(world, busy, { cycleId: c.id, milestoneId: next.id, status: 'done', updatedAt: ago(8) });
    await rawTask(world, busy, { cycleId: c.id, milestoneId: next.id, status: 'todo', updatedAt: ago(8) });
    await rawTask(world, busy, {
      cycleId: c.id,
      milestoneId: next.id,
      status: 'canceled',
      updatedAt: ago(8),
    });
    await rawTask(world, busy, { status: 'in_progress', updatedAt: ago(1) });
    await rawTask(world, busy, { status: 'in_review', updatedAt: ago(8) });
    await rawTask(world, busy, { status: 'backlog', updatedAt: ago(8) });

    const late = await createMilestoneRow(ctx.db, scopeOf(quiet), {
      createdById: world.owner.id,
      name: 'Late',
      targetDate: day(-1),
    });
    await rawTask(world, quiet, { milestoneId: late.id, updatedAt: ago(10) });

    await createCycleRow(ctx.db, scopeOf(off), { startsOn: day(-2), endsOn: day(4) });
    await createMilestoneRow(ctx.db, scopeOf(off), { createdById: world.owner.id, targetDate: day(3) });
    await updateProject(ctx, world.ownerActor, {
      project: off.key,
      usesMilestones: false,
      usesCycles: false,
    });

    // Rows ignore the scope switch.
    const result = await dashboard(world.memberActor, 'mine');
    expect(result.projects.map((row) => row.key)).toEqual([off.key, busy.key, quiet.key]);
    const [offRow, busyRow, quietRow] = result.projects;
    expect(busyRow).toEqual({
      key: busy.key,
      name: 'Busy',
      openCounts: { backlog: 1, todo: 1, in_progress: 1, in_review: 1 },
      openCount: 4,
      usesMilestones: true,
      usesCycles: true,
      lastActivityAt: expect.any(String),
      currentCycle: { number: c.number, name: 'Sprint', endsOn: day(4), daysLeft: 5, done: 1, total: 3 },
      nextMilestone: {
        id: next.id,
        name: 'Next',
        targetDate: day(5),
        overdue: false,
        done: 1,
        total: 2,
        others: 2,
      },
    });
    expect(quietRow?.nextMilestone).toMatchObject({
      name: 'Late',
      overdue: true,
      done: 0,
      total: 1,
      others: 0,
    });
    expect(quietRow?.currentCycle).toBeNull();
    expect(offRow).toMatchObject({
      usesMilestones: false,
      usesCycles: false,
      currentCycle: null,
      nextMilestone: null,
    });
    expect(Date.parse(busyRow?.lastActivityAt ?? '')).toBeGreaterThan(
      Date.parse(quietRow?.lastActivityAt ?? ''),
    );
  });
});

// ---------------------------------------------------------------------------

describe('agents', () => {
  it('shows the oldest in-progress task, the count, the stalled flag and the last activity, stalled first', async () => {
    const world = await createWorld(ctx.db);
    const p = await newProject(world);
    const addAgent = async (name: string) => {
      const agent = await createUser(ctx.db, { name, kind: 'agent', responsibleUserId: world.owner.id });
      await ctx.db
        .insert(member)
        .values({ organizationId: world.workspaceId, userId: agent.id, role: 'member' });
      return agent;
    };
    const alpha = await addAgent(`alpha-${randomProjectKey().toLowerCase()}`);
    const beta = await addAgent(`beta-${randomProjectKey().toLowerCase()}`);

    const oldest = await rawTask(world, p, {
      title: 'Oldest',
      status: 'in_progress',
      assigneeId: world.agent.id,
      updatedAt: ago(30),
    });
    await rawTask(world, p, { status: 'in_progress', assigneeId: world.agent.id, updatedAt: ago(1) });
    await rawTask(world, p, { status: 'todo', assigneeId: world.agent.id, updatedAt: ago(100) });
    const alphaTask = await rawTask(world, p, {
      status: 'in_progress',
      assigneeId: alpha.id,
      updatedAt: ago(40),
    });
    // A fresh comment on alpha's task keeps it from stalling.
    const touch = await createCommentRow(ctx.db, scopeOf(p), {
      taskId: alphaTask.id,
      authorId: alpha.id,
      onBehalfOfId: world.owner.id,
      createdAt: ago(2),
    });

    const everyone = await dashboard(world.ownerActor, 'everyone');
    expect(everyone.agents.map((row) => row.agent.id)).toEqual([world.agent.id, alpha.id, beta.id]);
    const [stalled, active, idle] = everyone.agents;
    expect(stalled).toEqual({
      agent: {
        id: world.agent.id,
        name: world.agent.name,
        kind: 'agent',
        responsible: { id: world.member.id, name: world.member.name, kind: 'person' },
      },
      currentTask: {
        key: keyOf(p, oldest),
        title: 'Oldest',
        status: 'in_progress',
        priority: 'none',
        project: { key: p.key, name: p.name },
      },
      inProgressCount: 2,
      stalled: true,
      lastActivityAt: null,
    });
    expect(active).toMatchObject({
      currentTask: { key: keyOf(p, alphaTask) },
      inProgressCount: 1,
      stalled: false,
      lastActivityAt: touch.createdAt.toISOString(),
    });
    expect(idle).toMatchObject({
      currentTask: null,
      inProgressCount: 0,
      stalled: false,
      lastActivityAt: null,
    });

    // The agent's own activity counts; Mine shows only my agents.
    await updateTask(ctx, world.agentActor, { key: keyOf(p, oldest), title: 'Oldest, touched' });
    const mine = await dashboard(world.memberActor);
    expect(mine.agents).toHaveLength(1);
    expect(mine.agents[0]).toMatchObject({
      agent: { id: world.agent.id },
      stalled: false,
      lastActivityAt: expect.any(String),
    });
    expect((await dashboard(world.ownerActor)).agents.map((row) => row.agent.id)).toEqual([
      alpha.id,
      beta.id,
    ]);
  });
  it('lastActivityAt is the newest activity row or comment in the projects in scope, as the aggregate was', async () => {
    const world = await createWorld(ctx.db);
    const a = await newProject(world, 'Readable');
    const b = await newProject(world, 'Hidden from the key');
    const addAgent = async (name: string, responsibleUserId: string) => {
      const agent = await createUser(ctx.db, { name, kind: 'agent', responsibleUserId });
      await ctx.db
        .insert(member)
        .values({ organizationId: world.workspaceId, userId: agent.id, role: 'member' });
      return agent;
    };
    const suffix = randomProjectKey().toLowerCase();
    // world.agent (the member's): newest is a comment in b; in a, a comment beats older activity.
    // busy (the member's): newest is activity in b; in a, activity beats an older comment.
    // elsewhere (the owner's): rows in b only. quiet (the owner's): nothing at all.
    const busy = await addAgent(`busy-${suffix}`, world.member.id);
    const elsewhere = await addAgent(`elsewhere-${suffix}`, world.owner.id);
    const quiet = await addAgent(`quiet-${suffix}`, world.owner.id);
    const taskA = await rawTask(world, a);
    const taskB = await rawTask(world, b);

    const act = async (p: ProjectRow, taskId: string, actorId: string | null, hours: number) => {
      const createdAt = ago(hours);
      await ctx.db.insert(activity).values({
        ...scopeOf(p),
        taskId,
        actorId,
        type: 'task.updated',
        changes: [{ field: 'title', from: 'a', to: 'b' }],
        createdAt,
      });
      return createdAt.toISOString();
    };
    const say = async (p: ProjectRow, taskId: string, authorId: string, hours: number) =>
      (
        await createCommentRow(ctx.db, scopeOf(p), { taskId, authorId, createdAt: ago(hours) })
      ).createdAt.toISOString();

    await act(a, taskA.id, world.agent.id, 10);
    const agentInA = await say(a, taskA.id, world.agent.id, 5);
    await act(b, taskB.id, world.agent.id, 1);
    const agentNewest = await say(b, taskB.id, world.agent.id, 0.5);
    const busyInA = await act(a, taskA.id, busy.id, 3);
    await say(a, taskA.id, busy.id, 6);
    await say(b, taskB.id, busy.id, 0.4);
    const busyNewest = await act(b, taskB.id, busy.id, 0.2);
    await act(b, taskB.id, elsewhere.id, 2);
    await say(b, taskB.id, elsewhere.id, 4);
    // Rows by people and the system never count for an agent.
    await act(a, taskA.id, world.owner.id, 0.1);
    await act(a, taskA.id, null, 0.1);
    await say(a, taskA.id, world.member.id, 0.1);

    /** The query before PM-8: one max() aggregate each over the agents' activity and comments. */
    const reference = async (agentIds: string[], projectIds: string[]) => {
      const rows = await ctx.db.execute<{ id: string; at: Date | string | null }>(sql`
        with agent as (select unnest(${sql.param(agentIds)}::uuid[]) as id),
        acted as (
          select a.actor_id as id, max(a.created_at) as at from activity a
          where a.actor_id in (select id from agent) and a.project_id = any(${sql.param(projectIds)}::uuid[])
          group by a.actor_id),
        wrote as (
          select c.author_id as id, max(c.created_at) as at
          from task wt join comment c on c.task_id = wt.id
          where c.author_id in (select id from agent) and wt.project_id = any(${sql.param(projectIds)}::uuid[])
          group by c.author_id)
        select agent.id, greatest(acted.at, wrote.at) as at from agent
        left join acted on acted.id = agent.id left join wrote on wrote.id = agent.id`);
      return Object.fromEntries(
        rows.rows.map((row) => [row.id, row.at === null ? null : new Date(row.at).toISOString()]),
      );
    };
    const lastActivity = (result: Dashboard) =>
      Object.fromEntries(result.agents.map((row) => [row.agent.id, row.lastActivityAt]));

    const all = [world.agent.id, busy.id, elsewhere.id, quiet.id];
    const mineAgents = [world.agent.id, busy.id];
    const keyA = (actor: Actor) => personKey(actor, { projects: [a.id], access: 'read' });

    const everyone = lastActivity(await dashboard(world.ownerActor, 'everyone'));
    expect(everyone).toEqual({
      [world.agent.id]: agentNewest,
      [busy.id]: busyNewest,
      [elsewhere.id]: expect.any(String),
      [quiet.id]: null,
    });
    expect(everyone).toEqual(await reference(all, [a.id, b.id]));

    const everyoneInA = lastActivity(await dashboard(keyA(world.ownerActor), 'everyone'));
    expect(everyoneInA).toEqual({
      [world.agent.id]: agentInA,
      [busy.id]: busyInA,
      [elsewhere.id]: null,
      [quiet.id]: null,
    });
    expect(everyoneInA).toEqual(await reference(all, [a.id]));

    const mine = lastActivity(await dashboard(world.memberActor));
    expect(mine).toEqual({ [world.agent.id]: agentNewest, [busy.id]: busyNewest });
    expect(mine).toEqual(await reference(mineAgents, [a.id, b.id]));

    const mineInA = lastActivity(await dashboard(keyA(world.memberActor)));
    expect(mineInA).toEqual({ [world.agent.id]: agentInA, [busy.id]: busyInA });
    expect(mineInA).toEqual(await reference(mineAgents, [a.id]));

    // The owner is responsible for elsewhere and quiet only; neither has a row in a.
    expect(lastActivity(await dashboard(keyA(world.ownerActor)))).toEqual({
      [elsewhere.id]: null,
      [quiet.id]: null,
    });
  });
});
