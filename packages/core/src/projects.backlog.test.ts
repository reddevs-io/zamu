// M3: project shapes carry the Backlog.md source; an active source constrains key, repository and
// the milestones switch.
import { PROJECT_OWNED_FIELDS } from '@zamu/contracts';
import { schema } from '@zamu/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mirroredExtensions, ProjectMirrored } from './errors';
import {
  backlogSummaryFor,
  createProject,
  isMirrored,
  listProjects,
  REPOSITORY_CLEARED_ERROR,
  updateProject,
} from './projects';
import { createMirroredProject, createMirroredTaskRow, type MirroredProject } from './testing/backlog';
import { createWorld, type TestContext, testContext, type World } from './testing/fixtures';

async function sourceOf(ctx: TestContext, projectId: string) {
  const [row] = await ctx.db
    .select()
    .from(schema.backlogSource)
    .where(eq(schema.backlogSource.projectId, projectId));
  return row;
}

describe('projects with a Backlog.md source', () => {
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

  it('tells mirrored projects apart', async () => {
    const w = await createWorld(ctx.db);
    const imported = await createMirroredProject(ctx.db, w, { mode: 'import', state: 'reading' });
    const detached = await createMirroredProject(ctx.db, w, { state: 'detached' });
    const paused = await createMirroredProject(ctx.db, w, { state: 'paused' });
    const native = await createProject(ctx, w.ownerActor, { name: 'Native', key: 'NAT' });
    await expect(isMirrored(ctx.db, mirror.project.id)).resolves.toBe(true);
    await expect(isMirrored(ctx.db, paused.project.id)).resolves.toBe(true);
    await expect(isMirrored(ctx.db, imported.project.id)).resolves.toBe(false);
    await expect(isMirrored(ctx.db, detached.project.id)).resolves.toBe(false);
    await expect(isMirrored(ctx.db, native.id)).resolves.toBe(false);
  });

  it('summarises the source on project shapes, counting no hidden task', async () => {
    // A hidden open task: no open count, no assignee, but one more hidden.
    await createMirroredTaskRow(ctx.db, mirror.scope, {
      number: 800,
      backlogId: 'BACK-800',
      status: 'todo',
      assigneeId: world.member.id,
      hiddenAt: new Date(),
      createdById: world.owner.id,
    });
    const { items } = await listProjects(ctx, world.memberActor);
    const item = items.find((project) => project.id === mirror.project.id);
    expect(item).toMatchObject({
      key: mirror.key,
      locked: [...PROJECT_OWNED_FIELDS],
      backlog: {
        mode: 'mirror',
        state: 'warnings',
        defaultBranch: 'main',
        lastReadCommit: mirror.source.lastReadCommit,
        lastTrigger: 'webhook',
        problems: { files: 1, values: 1 },
        hidden: 2,
        detachedAt: null,
      },
      openCounts: { backlog: 1, todo: 2, in_progress: 1, in_review: 0 },
      openCount: 4,
    });
    expect(item?.backlog?.lastReadAt).toBe(mirror.source.lastReadAt?.toISOString());
    expect(item?.assignees.map((user) => user.id)).toEqual([world.owner.id]);

    const native = await createProject(ctx, world.ownerActor, { name: 'Native', key: 'NAT' });
    expect(native).toMatchObject({ backlog: null, locked: [] });
    const summaries = await backlogSummaryFor(ctx.db, [mirror.project.id, native.id]);
    expect([...summaries.keys()]).toEqual([mirror.project.id]);
  });

  it('counts a file once when it is both skipped and warned about', async () => {
    const w = await createWorld(ctx.db);
    const m = await createMirroredProject(ctx.db, w);
    await ctx.db
      .update(schema.backlogSource)
      .set({
        warnings: [
          { kind: 'file', path: m.files.skipped, backlogId: 'BACK-233', skipped: true, message: 'bad YAML' },
          {
            kind: 'file',
            path: m.files.parent,
            backlogId: 'BACK-786',
            skipped: false,
            message: 'unreadable date',
          },
          { kind: 'unknown' },
        ],
      })
      .where(eq(schema.backlogSource.id, m.source.id));
    const summary = (await backlogSummaryFor(ctx.db, [m.project.id])).get(m.project.id);
    expect(summary?.problems).toEqual({ files: 2, values: 0 });
  });

  it('refuses a key change and turning milestones off while the source is active', async () => {
    const key = await updateProject(ctx, world.ownerActor, { project: mirror.key, key: 'PAYX' }).catch(
      (e) => e,
    );
    expect(key).toBeInstanceOf(ProjectMirrored);
    expect(mirroredExtensions(key)).toMatchObject({ field: 'key' });
    const milestones = await updateProject(ctx, world.ownerActor, {
      project: mirror.key,
      usesMilestones: false,
    }).catch((e) => e);
    expect(milestones).toBeInstanceOf(ProjectMirrored);
    expect(mirroredExtensions(milestones)).toMatchObject({ field: 'usesMilestones' });
    expect((milestones as Error).message).toContain('Milestones stay on');

    // Name, description and cycles stay editable.
    const renamed = await updateProject(ctx, world.memberActor, {
      project: mirror.key,
      name: 'Payments',
      description: 'Card payments',
      usesCycles: false,
    });
    expect(renamed).toMatchObject({ name: 'Payments', description: 'Card payments', usesCycles: false });
    expect(renamed.backlog?.mode).toBe('mirror');
  });

  it('refuses another repository, pauses the source when it is cleared and clears that reason when it returns', async () => {
    const w = await createWorld(ctx.db);
    const m = await createMirroredProject(ctx.db, w, { repository: 'https://gitlab.com/reddevs/pay-mirror' });
    const elsewhere = await updateProject(ctx, w.ownerActor, {
      project: m.key,
      repository: 'https://gitlab.com/reddevs/other',
    }).catch((e) => e);
    expect(elsewhere).toBeInstanceOf(ProjectMirrored);
    expect(mirroredExtensions(elsewhere)).toMatchObject({ field: 'repository' });

    // The same repository written another way is fine.
    await expect(
      updateProject(ctx, w.ownerActor, {
        project: m.key,
        repository: 'git@gitlab.com:reddevs/pay-mirror.git',
      }),
    ).resolves.toMatchObject({ repository: 'git@gitlab.com:reddevs/pay-mirror.git' });
    expect((await sourceOf(ctx, m.project.id))?.state).toBe('warnings');

    const cleared = await updateProject(ctx, w.ownerActor, { project: m.key, repository: null });
    expect(cleared).toMatchObject({ repository: null, backlog: { state: 'paused' } });
    expect(await sourceOf(ctx, m.project.id)).toMatchObject({
      state: 'paused',
      lastError: REPOSITORY_CLEARED_ERROR,
    });

    await updateProject(ctx, w.ownerActor, {
      project: m.key,
      repository: 'https://gitlab.com/reddevs/pay-mirror',
    });
    expect(await sourceOf(ctx, m.project.id)).toMatchObject({ state: 'paused', lastError: null });
  });

  it('lets a detached project change everything but a key with tasks', async () => {
    const w = await createWorld(ctx.db);
    const detached = await createMirroredProject(ctx.db, w, { state: 'detached' });
    const updated = await updateProject(ctx, w.ownerActor, {
      project: detached.key,
      usesMilestones: false,
      repository: 'https://gitlab.com/reddevs/elsewhere',
    });
    expect(updated).toMatchObject({ usesMilestones: false, locked: [], backlog: { state: 'detached' } });
    expect(updated.backlog?.detachedAt).not.toBeNull();
    const key = await updateProject(ctx, w.ownerActor, { project: detached.key, key: 'NEWK' }).catch(
      (e) => e,
    );
    expect(key).not.toBeInstanceOf(ProjectMirrored);
    expect((key as Error).message).toContain('already has tasks');
  });
});
