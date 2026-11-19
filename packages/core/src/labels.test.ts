// M5 labels: CRUD in project settings, created on use by task writes, locked names for Backlog.md.
import { schema } from '@zamu/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { listTaskActivity } from './activity';
import { Forbidden, NotFound } from './errors';
import {
  createLabel,
  deleteLabel,
  findOrCreateLabels,
  listLabels,
  pickLabelColor,
  updateLabel,
} from './labels';
import { createProject } from './projects';
import { LabelExists, LabelMirrored, problemCodeOf } from './relations';
import { createTask, getTask, updateTask } from './tasks';
import {
  addTaskLabels,
  createLabelRow,
  createTaskRow,
  createWorld,
  keyActor,
  projectRow,
  randomProjectKey,
  scopeOf,
  type TestContext,
  testContext,
  type World,
} from './testing/fixtures';

describe('labels', () => {
  let ctx: TestContext;
  let world: World;

  beforeAll(async () => {
    ctx = testContext();
    world = await createWorld(ctx.db);
  });
  afterAll(async () => {
    await ctx?.close();
  });

  async function newProject() {
    const key = randomProjectKey();
    await createProject(ctx, world.ownerActor, { name: `Labels ${key}`, key });
    return { key, row: await projectRow(ctx.db, world.workspaceId, key) };
  }

  it('creates labels with the least used hue, ties to the lowest number', async () => {
    const { key } = await newProject();
    const first = await createLabel(ctx, world.memberActor, { project: key, name: 'backend' });
    expect(first).toMatchObject({ name: 'backend', color: 1, source: 'app', usageCount: 0 });
    const second = await createLabel(ctx, world.memberActor, { project: key, name: 'payouts' });
    expect(second.color).toBe(2);
    // An explicit colour is kept, and counts for later picks.
    await createLabel(ctx, world.memberActor, { project: key, name: 'web', color: 3 });
    await createLabel(ctx, world.memberActor, { project: key, name: 'ops', color: 1 });
    const next = await createLabel(ctx, world.memberActor, { project: key, name: 'docs' });
    expect(next.color).toBe(4);
  });

  it('wraps around once every hue is used', async () => {
    const { key, row } = await newProject();
    for (let color = 1; color <= 9; color++) {
      await createLabelRow(ctx.db, scopeOf(row), { name: `hue-${color}`, color });
    }
    await createLabelRow(ctx.db, scopeOf(row), { name: 'extra', color: 1 });
    await expect(pickLabelColor(ctx.db, row.id)).resolves.toBe(2);
    await expect(createLabel(ctx, world.memberActor, { project: key, name: 'tenth' })).resolves.toMatchObject(
      {
        color: 2,
      },
    );
  });

  it('counts each label created in one write once when picking hues', async () => {
    const empty = await newProject();
    const created = await ctx.db.transaction((tx) =>
      findOrCreateLabels(tx, scopeOf(empty.row), ['one', 'two', 'three']),
    );
    expect(created.map((row) => row.color)).toEqual([1, 2, 3]);
    // Hues 2 to 9 taken once: the first new label takes 1; then every hue is used once, so the
    // second takes 1 again (counting the first twice would push it to 2).
    const { row } = await newProject();
    for (let color = 2; color <= 9; color++) {
      await createLabelRow(ctx.db, scopeOf(row), { name: `taken-${color}`, color });
    }
    const pair = await ctx.db.transaction((tx) => findOrCreateLabels(tx, scopeOf(row), ['first', 'second']));
    expect(pair.map((label) => label.color)).toEqual([1, 1]);
  });

  it('refuses a name the project has already, ignoring case', async () => {
    const { key } = await newProject();
    await createLabel(ctx, world.memberActor, { project: key, name: 'Backend' });
    const error = await createLabel(ctx, world.memberActor, { project: key, name: '  backend ' }).catch(
      (e) => e,
    );
    expect(error).toBeInstanceOf(LabelExists);
    expect(problemCodeOf(error)).toBe('LABEL_EXISTS');
    // Another project may use the name.
    const other = await newProject();
    await expect(
      createLabel(ctx, world.memberActor, { project: other.key, name: 'backend' }),
    ).resolves.toBeTruthy();
  });

  it('lists labels by name with usage counts that leave hidden tasks out', async () => {
    const { key, row } = await newProject();
    const scope = scopeOf(row);
    const zeta = await createLabelRow(ctx.db, scope, { name: 'zeta' });
    const alpha = await createLabelRow(ctx.db, scope, { name: 'Alpha', color: 4 });
    const beta = await createLabelRow(ctx.db, scope, { name: 'beta' });
    const visible = await createTaskRow(ctx.db, row.id, { createdById: world.owner.id });
    const hidden = await createTaskRow(ctx.db, row.id, { createdById: world.owner.id, hiddenAt: new Date() });
    await addTaskLabels(ctx.db, visible.id, [alpha.id, zeta.id]);
    await addTaskLabels(ctx.db, hidden.id, [alpha.id]);

    const list = await listLabels(ctx, world.memberActor, { project: key.toLowerCase() });
    expect(list.items).toEqual([
      { id: alpha.id, name: 'Alpha', color: 4, source: 'app', usageCount: 1 },
      { id: beta.id, name: 'beta', color: 1, source: 'app', usageCount: 0 },
      { id: zeta.id, name: 'zeta', color: 1, source: 'app', usageCount: 1 },
    ]);
  });

  it('renames and recolours, and refuses a clash with another label', async () => {
    const { key, row } = await newProject();
    const label = await createLabelRow(ctx.db, scopeOf(row), { name: 'bug' });
    await createLabelRow(ctx.db, scopeOf(row), { name: 'feature' });

    await expect(
      updateLabel(ctx, world.memberActor, { project: key, id: label.id, name: 'Bug' }),
    ).resolves.toMatchObject({ name: 'Bug', color: 1 });
    await expect(
      updateLabel(ctx, world.memberActor, { project: key, id: label.id, color: 7 }),
    ).resolves.toMatchObject({
      name: 'Bug',
      color: 7,
    });
    await expect(
      updateLabel(ctx, world.memberActor, { project: key, id: label.id, name: 'FEATURE' }),
    ).rejects.toThrow(LabelExists);
    const other = await newProject();
    await expect(
      updateLabel(ctx, world.memberActor, { project: other.key, id: label.id, color: 2 }),
    ).rejects.toThrow(NotFound);
  });

  it('keeps the name of a label from Backlog.md but lets its colour change', async () => {
    const { key, row } = await newProject();
    const label = await createLabelRow(ctx.db, scopeOf(row), { name: 'payments', source: 'backlog' });
    const rename = await updateLabel(ctx, world.memberActor, {
      project: key,
      id: label.id,
      name: 'pay',
    }).catch((e) => e);
    expect(rename).toBeInstanceOf(LabelMirrored);
    expect(problemCodeOf(rename)).toBe('LABEL_MIRRORED');
    await expect(
      updateLabel(ctx, world.memberActor, { project: key, id: label.id, name: 'payments', color: 5 }),
    ).resolves.toMatchObject({ name: 'payments', color: 5, source: 'backlog' });
    await expect(deleteLabel(ctx, world.memberActor, { project: key, id: label.id })).rejects.toThrow(
      LabelMirrored,
    );
  });

  it('deletes a label off every task without activity, and says how many tasks lost it', async () => {
    const { key, row } = await newProject();
    const task = await createTask(ctx, world.memberActor, {
      project: key,
      title: 'Labelled',
      labels: ['temp'],
    });
    const [label] = task.labels ?? [];
    if (!label) throw new Error('no label');
    await expect(deleteLabel(ctx, world.memberActor, { project: key, id: label.id })).resolves.toEqual({
      usageCount: 1,
    });
    await expect(getTask(ctx, world.memberActor, { key: task.key })).resolves.toMatchObject({ labels: [] });
    const activity = await listTaskActivity(ctx, world.memberActor, { key: task.key });
    expect(activity.items).toHaveLength(1);
    // History keeps the name; the colour is gone with the label.
    expect(activity.items[0]?.changes).toContainEqual({
      field: 'labels',
      from: [],
      to: [{ id: label.id, name: 'temp', color: null }],
    });
    const rows = await ctx.db.select().from(schema.label).where(eq(schema.label.projectId, row.id));
    expect(rows).toEqual([]);
  });

  it('creates labels on use, keeping the first casing of a name', async () => {
    const { key } = await newProject();
    const existing = await createLabel(ctx, world.memberActor, { project: key, name: 'Backend' });
    const task = await createTask(ctx, world.memberActor, {
      project: key,
      title: 'Uses labels',
      labels: ['backend', 'Payouts', 'payouts', 'api'],
    });
    expect(task.labels?.map((label) => label.name)).toEqual(['api', 'Backend', 'Payouts']);
    expect(task.labels?.find((label) => label.name === 'Backend')?.id).toBe(existing.id);
    // New labels take the least used hues in the order they were named: Backend has 1.
    expect(task.labels?.find((label) => label.name === 'Payouts')?.color).toBe(2);
    expect(task.labels?.find((label) => label.name === 'api')?.color).toBe(3);

    const updated = await updateTask(ctx, world.memberActor, {
      key: task.key,
      addLabels: ['PAYOUTS', 'ops'],
    });
    expect(updated.labels?.map((label) => label.name)).toEqual(['api', 'Backend', 'ops', 'Payouts']);
    const list = await listLabels(ctx, world.memberActor, { project: key });
    expect(list.items.map((label) => [label.name, label.usageCount])).toEqual([
      ['api', 1],
      ['Backend', 1],
      ['ops', 1],
      ['Payouts', 1],
    ]);
  });

  it('reads with project.read and writes with task.write', async () => {
    const { key, row } = await newProject();
    const label = await createLabelRow(ctx.db, scopeOf(row), { name: 'locked' });
    const reader = keyActor(world, { projects: 'all', access: 'read' });
    await expect(listLabels(ctx, reader, { project: key })).resolves.toMatchObject({
      items: [{ id: label.id }],
    });
    await expect(createLabel(ctx, reader, { project: key, name: 'nope' })).rejects.toThrow(Forbidden);
    await expect(updateLabel(ctx, reader, { project: key, id: label.id, color: 2 })).rejects.toThrow(
      Forbidden,
    );
    await expect(deleteLabel(ctx, reader, { project: key, id: label.id })).rejects.toThrow(Forbidden);

    const elsewhere = keyActor(world, { projects: [crypto.randomUUID()], access: 'write' });
    await expect(listLabels(ctx, elsewhere, { project: key })).rejects.toThrow(Forbidden);
    const stranger = await createWorld(ctx.db, 'Other');
    await expect(listLabels(ctx, stranger.ownerActor, { project: key })).rejects.toThrow(NotFound);
  });
});
