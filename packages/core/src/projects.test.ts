import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createCycle, endCycle } from './cycles';
import { Conflict, Forbidden, Invalid, NotFound } from './errors';
import { createProject, listProjects, updateProject } from './projects';
import { createTask, updateTask } from './tasks';
import { createWorld, randomProjectKey, type TestContext, testContext, type World } from './testing/fixtures';

describe('projects', () => {
  let ctx: TestContext;
  let world: World;

  beforeAll(async () => {
    ctx = testContext();
    world = await createWorld(ctx.db);
  });
  afterAll(async () => {
    await ctx?.close();
  });

  it('creates a project with an upper-cased key and rejects duplicates', async () => {
    const created = await createProject(ctx, world.memberActor, {
      name: 'Payments',
      key: ' pay ',
      description: 'Card and bank payments',
    });
    expect(created).toMatchObject({ key: 'PAY', name: 'Payments', description: 'Card and bank payments' });
    expect(typeof created.createdAt).toBe('string');

    await expect(createProject(ctx, world.ownerActor, { name: 'Other', key: 'PAY' })).rejects.toThrow(
      Conflict,
    );
    await expect(createProject(ctx, world.ownerActor, { name: 'Bad', key: '1AB' })).rejects.toThrow(Invalid);
  });

  it('lets the same key exist in another workspace', async () => {
    const other = await createWorld(ctx.db, 'Elsewhere');
    await createProject(ctx, world.ownerActor, { name: 'Shared', key: 'SHR' });
    await expect(createProject(ctx, other.ownerActor, { name: 'Shared', key: 'SHR' })).resolves.toMatchObject(
      {
        key: 'SHR',
      },
    );
  });

  it('changes the key only while the project has no tasks', async () => {
    await createProject(ctx, world.ownerActor, { name: 'Docs', key: 'DOC' });
    const renamed = await updateProject(ctx, world.ownerActor, {
      project: 'doc',
      key: 'DOCS',
      name: 'Docs site',
    });
    expect(renamed).toMatchObject({ key: 'DOCS', name: 'Docs site' });

    await createTask(ctx, world.ownerActor, { project: 'DOCS', title: 'First page' });
    await expect(updateProject(ctx, world.ownerActor, { project: 'DOCS', key: 'DOCX' })).rejects.toThrow(
      /already has tasks/,
    );
    // Other fields still change, and a description can be cleared.
    await updateProject(ctx, world.ownerActor, { project: 'DOCS', description: 'Public docs' });
    const cleared = await updateProject(ctx, world.ownerActor, { project: 'DOCS', description: null });
    expect(cleared.description).toBeNull();

    await createProject(ctx, world.ownerActor, { name: 'Web', key: 'WEB' });
    await expect(updateProject(ctx, world.ownerActor, { project: 'WEB', key: 'PAY' })).rejects.toThrow(
      Conflict,
    );
    await expect(updateProject(ctx, world.ownerActor, { project: 'NOPE', name: 'x' })).rejects.toThrow(
      NotFound,
    );
  });

  it('lists projects with open counts, assignees and last activity', async () => {
    const w = await createWorld(ctx.db);
    await createProject(ctx, w.ownerActor, { name: 'Billing', key: 'BIL' });
    const quiet = await createProject(ctx, w.ownerActor, { name: 'Quiet', key: 'QUI' });
    await createTask(ctx, w.ownerActor, { project: 'BIL', title: 'a', status: 'backlog' });
    await createTask(ctx, w.ownerActor, { project: 'BIL', title: 'b', assignee: w.agent.id });
    await createTask(ctx, w.ownerActor, {
      project: 'BIL',
      title: 'c',
      status: 'in_progress',
      assignee: 'me',
    });
    await createTask(ctx, w.ownerActor, {
      project: 'BIL',
      title: 'd',
      status: 'done',
      assignee: w.member.id,
    });
    const review = await createTask(ctx, w.ownerActor, { project: 'BIL', title: 'e' });
    await updateTask(ctx, w.ownerActor, { key: review.key, status: 'in_review' });

    const { items } = await listProjects(ctx, w.memberActor);
    expect(items.map((p) => p.key)).toEqual(['BIL', 'QUI']);
    const [billing, quietRow] = items;
    expect(billing?.openCounts).toEqual({ backlog: 1, todo: 1, in_progress: 1, in_review: 1 });
    expect(billing?.openCount).toBe(4);
    // Done tasks do not count; people come before agents.
    expect(billing?.assignees.map((a) => a.id)).toEqual([w.owner.id, w.agent.id]);
    expect(quietRow).toMatchObject({ openCount: 0, assignees: [], lastActivityAt: quiet.updatedAt });
    expect(Date.parse(billing?.lastActivityAt ?? '')).toBeGreaterThanOrEqual(Date.parse(review.updatedAt));
  });

  it('limits listing and writes to the key scope', async () => {
    const w = await createWorld(ctx.db);
    const pay = await createProject(ctx, w.ownerActor, { name: 'Payments', key: 'PAY' });
    await createProject(ctx, w.ownerActor, { name: 'Web', key: 'WEB' });
    const scoped = { ...w.agentActor, scope: { projects: [pay.id], access: 'write' as const } };

    const { items } = await listProjects(ctx, scoped);
    expect(items.map((p) => p.key)).toEqual(['PAY']);
    await expect(createProject(ctx, scoped, { name: 'New', key: 'NEW' })).rejects.toThrow(Forbidden);
    await expect(updateProject(ctx, scoped, { project: 'WEB', name: 'x' })).rejects.toThrow(Forbidden);

    const readOnly = { ...w.agentActor, scope: { projects: 'all' as const, access: 'read' as const } };
    expect((await listProjects(ctx, readOnly)).items).toHaveLength(2);
    await expect(updateProject(ctx, readOnly, { project: 'PAY', name: 'x' })).rejects.toThrow(Forbidden);
  });

  it('links one repository per project, matched on host and path', async () => {
    const w = await createWorld(ctx.db);
    const pay = await createProject(ctx, w.ownerActor, {
      name: 'Payments',
      key: 'PAY',
      repository: 'git@gitlab.com:reddevs/payments.git',
    });
    expect(pay.repository).toBe('git@gitlab.com:reddevs/payments.git');
    const plain = await createProject(ctx, w.ownerActor, { name: 'Web', key: 'WEB', repository: '' });
    expect(plain.repository).toBeNull();

    // The same repository in another form is taken, and the message names the owner.
    const taken = createProject(ctx, w.ownerActor, {
      name: 'Copy',
      key: 'CPY',
      repository: 'https://GitLab.com/reddevs/payments',
    });
    await expect(taken).rejects.toThrow(Conflict);
    await expect(taken).rejects.toMatchObject({
      message:
        'Payments (PAY) already uses gitlab.com/reddevs/payments. A repository can belong to one project.',
      issues: [{ path: 'repository' }],
    });
    await expect(
      updateProject(ctx, w.ownerActor, {
        project: 'WEB',
        repository: 'ssh://git@gitlab.com:22/reddevs/payments',
      }),
    ).rejects.toThrow(/Payments \(PAY\) already uses/);

    // Its own project can switch to another form of the same URL, or to another repository.
    const ssh = await updateProject(ctx, w.ownerActor, {
      project: 'PAY',
      repository: 'https://gitlab.com/reddevs/payments.git',
    });
    expect(ssh.repository).toBe('https://gitlab.com/reddevs/payments.git');
    const listed = (await listProjects(ctx, w.ownerActor)).items.find((p) => p.key === 'PAY');
    expect(listed?.repository).toBe('https://gitlab.com/reddevs/payments.git');

    // Clearing frees the repository for another project.
    const cleared = await updateProject(ctx, w.ownerActor, { project: 'PAY', repository: null });
    expect(cleared.repository).toBeNull();
    const web = await updateProject(ctx, w.ownerActor, {
      project: 'WEB',
      repository: 'git@gitlab.com:reddevs/payments.git',
    });
    expect(web.repository).toBe('git@gitlab.com:reddevs/payments.git');

    await expect(
      updateProject(ctx, w.ownerActor, { project: 'PAY', repository: 'reddevs/payments' }),
    ).rejects.toThrow(Invalid);

    // Another workspace can link the same repository.
    const other = await createWorld(ctx.db, 'Elsewhere');
    await expect(
      createProject(ctx, other.ownerActor, {
        name: 'Web',
        key: 'WEB',
        repository: 'git@gitlab.com:reddevs/payments.git',
      }),
    ).resolves.toMatchObject({ key: 'WEB' });
  });

  it('does not name a project outside the key scope in a repository conflict', async () => {
    const w = await createWorld(ctx.db);
    await createProject(ctx, w.ownerActor, {
      name: 'Secret',
      key: 'SEC',
      repository: 'https://github.com/t/secret',
    });
    const mine = await createProject(ctx, w.ownerActor, { name: 'Mine', key: 'MIN' });
    const scoped = { ...w.agentActor, scope: { projects: [mine.id], access: 'write' as const } };
    await expect(
      updateProject(ctx, scoped, { project: 'MIN', repository: 'git@github.com:t/secret.git' }),
    ).rejects.toThrow(
      'Another project in this workspace already uses github.com/t/secret. A repository can belong to one project.',
    );
    // A project-scoped write key may link its own project.
    await expect(
      updateProject(ctx, scoped, { project: 'MIN', repository: 'git@github.com:t/mine.git' }),
    ).resolves.toMatchObject({ repository: 'git@github.com:t/mine.git' });
  });

  it('turns milestones and cycles on and off, both on by default', async () => {
    const created = await createProject(ctx, world.ownerActor, { name: 'Flags', key: randomProjectKey() });
    expect(created).toMatchObject({ usesMilestones: true, usesCycles: true, currentCycle: null });

    const off = await updateProject(ctx, world.memberActor, {
      project: created.key,
      usesMilestones: false,
      usesCycles: false,
    });
    expect(off).toMatchObject({ usesMilestones: false, usesCycles: false });
    // Unchanged values are a no-op, not an error.
    expect(
      await updateProject(ctx, world.memberActor, { project: created.key, usesCycles: false }),
    ).toMatchObject({
      usesCycles: false,
      updatedAt: off.updatedAt,
    });
    const on = await updateProject(ctx, world.memberActor, { project: created.key, usesCycles: true });
    expect(on).toMatchObject({ usesMilestones: false, usesCycles: true });

    const readOnly = { ...world.agentActor, scope: { projects: 'all' as const, access: 'read' as const } };
    await expect(
      updateProject(ctx, readOnly, { project: created.key, usesMilestones: true }),
    ).rejects.toThrow(Forbidden);
  });

  it('shows the current cycle in the project list and after updates', async () => {
    const w = await createWorld(ctx.db);
    const now = new Date('2040-05-09T08:00:00Z');
    const clock = { ...ctx, timeZone: 'UTC', now: () => now };
    const pay = await createProject(clock, w.ownerActor, { name: 'Payments', key: 'PAY' });
    await createProject(clock, w.ownerActor, { name: 'Web', key: 'WEB' });
    const cycle = await createCycle(clock, w.ownerActor, {
      project: 'PAY',
      name: 'Checkout',
      startsOn: '2040-05-01',
      endsOn: '2040-05-11',
    });
    await createCycle(clock, w.ownerActor, { project: 'WEB', startsOn: '2040-05-20', endsOn: '2040-05-30' });

    const byKey = async () =>
      Object.fromEntries((await listProjects(clock, w.ownerActor)).items.map((p) => [p.key, p.currentCycle]));
    expect(await byKey()).toEqual({
      PAY: {
        id: cycle.id,
        number: 1,
        name: 'Checkout',
        startsOn: '2040-05-01',
        endsOn: '2040-05-11',
        daysLeft: 3,
      },
      WEB: null,
    });
    expect(
      (await updateProject(clock, w.ownerActor, { project: 'PAY', name: 'Pay' })).currentCycle,
    ).toMatchObject({
      number: 1,
    });

    // Turning cycles off hides the current cycle; ending it removes it.
    expect(
      (await updateProject(clock, w.ownerActor, { project: 'PAY', usesCycles: false })).currentCycle,
    ).toBeNull();
    expect((await byKey()).PAY).toBeNull();
    await updateProject(clock, w.ownerActor, { project: 'PAY', usesCycles: true });
    await endCycle(clock, w.ownerActor, { project: pay.key, number: 'current' });
    expect((await byKey()).PAY).toBeNull();
  });
});
