import { MAX_COMMENT_LENGTH } from '@pm/contracts';
import { schema } from '@pm/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Actor } from './authz';
import { createComment, deleteComment, listComments, updateComment } from './comments';
import { Conflict, Forbidden, Invalid, NotFound } from './errors';
import { formatMention } from './mentions';
import { createWorld, randomProjectKey, type TestContext, testContext, type World } from './testing/fixtures';

describe('comments', () => {
  let ctx: TestContext;
  let world: World;
  let other: World;
  let projectId: string;
  let projectKey: string;
  let otherProjectId: string;
  let taskKey: string;
  let nextNumber = 1;

  // Local fixtures: rows are written directly so this suite does not depend on tasks.ts.
  async function newProject(workspaceId: string) {
    const key = randomProjectKey();
    const [row] = await ctx.db
      .insert(schema.project)
      .values({ workspaceId, key, name: `Project ${key}` })
      .returning();
    if (!row) throw new Error('project insert failed');
    return row;
  }

  async function newTaskRow() {
    const number = nextNumber++;
    const [row] = await ctx.db
      .insert(schema.task)
      .values({ projectId, number, title: `Task ${number}`, createdById: world.owner.id })
      .returning();
    if (!row) throw new Error('task insert failed');
    return { row, key: `${projectKey}-${number}` };
  }

  async function newTask() {
    return (await newTaskRow()).key;
  }

  async function mentionRows(commentId: string) {
    const rows = await ctx.db
      .select({ userId: schema.commentMention.userId })
      .from(schema.commentMention)
      .where(eq(schema.commentMention.commentId, commentId));
    return rows.map((row) => row.userId).sort();
  }

  /** The actor through an API key with the given scope. */
  function withKey(actor: Actor, scope: NonNullable<Actor['scope']>): Actor {
    return { ...actor, scope, apiKeyId: crypto.randomUUID() };
  }

  beforeAll(async () => {
    ctx = testContext();
    world = await createWorld(ctx.db);
    other = await createWorld(ctx.db, 'Elsewhere');
    const projectRow = await newProject(world.workspaceId);
    projectId = projectRow.id;
    projectKey = projectRow.key;
    otherProjectId = (await newProject(world.workspaceId)).id;
    taskKey = await newTask();
  });
  afterAll(async () => {
    await ctx?.close();
  });

  describe('create and list', () => {
    it('creates a comment as a person, trims it and records mentions', async () => {
      const created = await createComment(ctx, world.ownerActor, {
        key: taskKey.toLowerCase(),
        body: `  Over to @${world.agent.name}  `,
      });
      expect(created).toMatchObject({
        taskKey,
        author: { id: world.owner.id, kind: 'person' },
        onBehalfOf: null,
        body: `Over to ${formatMention(world.agent.name, world.agent.id)}`,
        mentions: [{ id: world.agent.id, name: world.agent.name, kind: 'agent' }],
        editedAt: null,
        deletedAt: null,
      });
      expect(await mentionRows(created.id)).toEqual([world.agent.id]);
    });

    it('records the responsible human when an agent comments', async () => {
      const created = await createComment(ctx, world.agentActor, {
        key: taskKey,
        body: `Tests pass. @${world.member.email}`,
      });
      expect(created).toMatchObject({
        author: { id: world.agent.id, kind: 'agent' },
        onBehalfOf: { id: world.member.id, kind: 'person' },
        mentions: [{ id: world.member.id }],
      });
    });

    it('does not touch the task', async () => {
      const { row: before, key } = await newTaskRow();
      await createComment(ctx, world.memberActor, { key, body: 'No change' });
      const [after] = await ctx.db.select().from(schema.task).where(eq(schema.task.id, before.id));
      expect(after?.updatedAt).toEqual(before.updatedAt);
      const activity = await ctx.db
        .select()
        .from(schema.activity)
        .where(eq(schema.activity.taskId, before.id));
      expect(activity).toHaveLength(0);
    });

    it('lists comments oldest first', async () => {
      const key = await newTask();
      const first = await createComment(ctx, world.ownerActor, { key, body: 'one' });
      const second = await createComment(ctx, world.agentActor, { key, body: 'two' });
      const { items } = await listComments(ctx, world.memberActor, { key });
      expect(items.map((item) => item.id)).toEqual([first.id, second.id]);
    });

    it('rejects empty and oversized bodies', async () => {
      await expect(
        createComment(ctx, world.ownerActor, { key: taskKey, body: '   ' }),
      ).rejects.toBeInstanceOf(Invalid);
      await expect(
        createComment(ctx, world.ownerActor, { key: taskKey, body: 'x'.repeat(MAX_COMMENT_LENGTH + 1) }),
      ).rejects.toBeInstanceOf(Invalid);
      // Exactly the limit is fine, and trimming happens first.
      await expect(
        createComment(ctx, world.ownerActor, { key: taskKey, body: ` ${'x'.repeat(MAX_COMMENT_LENGTH)} ` }),
      ).resolves.toMatchObject({ body: 'x'.repeat(MAX_COMMENT_LENGTH) });
    });

    it('rejects a body that outgrows the limit once mentions are rewritten', async () => {
      const mention = `@${world.agent.name}`;
      const body = `${'x'.repeat(MAX_COMMENT_LENGTH - mention.length - 1)} ${mention}`;
      expect(body).toHaveLength(MAX_COMMENT_LENGTH);
      const error = await createComment(ctx, world.ownerActor, { key: taskKey, body }).catch(
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(Invalid);
      expect((error as Invalid).issues).toEqual([
        { path: 'body', message: expect.stringContaining('mentions') },
      ]);
    });

    it('returns NotFound for unknown tasks and tasks of other workspaces', async () => {
      await expect(
        createComment(ctx, world.ownerActor, { key: `${projectKey}-9999`, body: 'hi' }),
      ).rejects.toBeInstanceOf(NotFound);
      await expect(createComment(ctx, other.ownerActor, { key: taskKey, body: 'hi' })).rejects.toBeInstanceOf(
        NotFound,
      );
      await expect(listComments(ctx, other.ownerActor, { key: taskKey })).rejects.toBeInstanceOf(NotFound);
    });
  });

  describe('edit and delete', () => {
    it('lets the author edit, marks it edited and rewrites mentions', async () => {
      const created = await createComment(ctx, world.memberActor, {
        key: taskKey,
        body: `cc @${world.agent.name}`,
      });
      const edited = await updateComment(ctx, world.memberActor, {
        id: created.id,
        body: `cc @${world.owner.email} instead`,
      });
      expect(edited).toMatchObject({
        id: created.id,
        body: `cc ${formatMention(world.owner.name, world.owner.id)} instead`,
        mentions: [{ id: world.owner.id }],
        deletedAt: null,
      });
      expect(edited.editedAt).not.toBeNull();
      expect(Date.parse(edited.editedAt ?? '')).toBeGreaterThanOrEqual(Date.parse(created.createdAt));
      expect(await mentionRows(created.id)).toEqual([world.owner.id]);
    });

    it('does not mark an unchanged body as edited', async () => {
      const created = await createComment(ctx, world.memberActor, {
        key: taskKey,
        body: `hi @${world.agent.name}`,
      });
      // The composer sends back the stored form; the API may send the plain form again.
      const same = await updateComment(ctx, world.memberActor, {
        id: created.id,
        body: `hi @${world.agent.name}`,
      });
      expect(same.editedAt).toBeNull();
      expect(same.body).toBe(created.body);
    });

    it('lets an agent edit and delete its own comment', async () => {
      const created = await createComment(ctx, world.agentActor, { key: taskKey, body: 'draft' });
      await expect(
        updateComment(ctx, world.agentActor, { id: created.id, body: 'final' }),
      ).resolves.toMatchObject({
        body: 'final',
        onBehalfOf: { id: world.member.id },
      });
      await expect(deleteComment(ctx, world.agentActor, { id: created.id })).resolves.toMatchObject({
        body: null,
      });
    });

    it('forbids anyone but the author, admins included', async () => {
      const created = await createComment(ctx, world.memberActor, { key: taskKey, body: 'mine' });
      for (const actor of [world.ownerActor, world.agentActor]) {
        await expect(updateComment(ctx, actor, { id: created.id, body: 'theirs' })).rejects.toBeInstanceOf(
          Forbidden,
        );
        await expect(deleteComment(ctx, actor, { id: created.id })).rejects.toBeInstanceOf(Forbidden);
      }
    });

    it("forbids the responsible human from editing or deleting their agent's comment", async () => {
      const created = await createComment(ctx, world.agentActor, { key: taskKey, body: 'agent words' });
      // world.member is the agent's responsible human.
      await expect(
        updateComment(ctx, world.memberActor, { id: created.id, body: 'human words' }),
      ).rejects.toBeInstanceOf(Forbidden);
      await expect(deleteComment(ctx, world.memberActor, { id: created.id })).rejects.toBeInstanceOf(
        Forbidden,
      );
      const { items } = await listComments(ctx, world.memberActor, { key: taskKey });
      expect(items.find((item) => item.id === created.id)?.body).toBe('agent words');
    });

    it('soft-deletes: body and mentions go, the entry stays; further changes conflict', async () => {
      const created = await createComment(ctx, world.ownerActor, {
        key: taskKey,
        body: `bye @${world.agent.name}`,
      });
      const deleted = await deleteComment(ctx, world.ownerActor, { id: created.id });
      expect(deleted).toMatchObject({
        id: created.id,
        body: null,
        mentions: [],
        author: { id: world.owner.id },
      });
      expect(deleted.deletedAt).not.toBeNull();
      expect(await mentionRows(created.id)).toEqual([]);

      const { items } = await listComments(ctx, world.memberActor, { key: taskKey });
      expect(items.find((item) => item.id === created.id)).toMatchObject({
        body: null,
        deletedAt: deleted.deletedAt,
      });

      await expect(
        updateComment(ctx, world.ownerActor, { id: created.id, body: 'back' }),
      ).rejects.toBeInstanceOf(Conflict);
      await expect(deleteComment(ctx, world.ownerActor, { id: created.id })).rejects.toBeInstanceOf(Conflict);
    });

    it('returns NotFound for unknown comments and comments of other workspaces', async () => {
      const created = await createComment(ctx, world.ownerActor, { key: taskKey, body: 'private' });
      await expect(
        updateComment(ctx, world.ownerActor, { id: '0192f3a0-0000-7000-8000-00000000ffff', body: 'x' }),
      ).rejects.toBeInstanceOf(NotFound);
      await expect(
        updateComment(ctx, other.ownerActor, { id: created.id, body: 'x' }),
      ).rejects.toBeInstanceOf(NotFound);
      await expect(deleteComment(ctx, other.ownerActor, { id: created.id })).rejects.toBeInstanceOf(NotFound);
    });
  });

  describe('key scope', () => {
    it('limits a key scoped to another project', async () => {
      const created = await createComment(ctx, world.agentActor, { key: taskKey, body: 'scoped' });
      const elsewhere = withKey(world.agentActor, { projects: [otherProjectId], access: 'write' });
      await expect(listComments(ctx, elsewhere, { key: taskKey })).rejects.toBeInstanceOf(Forbidden);
      await expect(createComment(ctx, elsewhere, { key: taskKey, body: 'x' })).rejects.toBeInstanceOf(
        Forbidden,
      );
      await expect(updateComment(ctx, elsewhere, { id: created.id, body: 'x' })).rejects.toBeInstanceOf(
        Forbidden,
      );
      await expect(deleteComment(ctx, elsewhere, { id: created.id })).rejects.toBeInstanceOf(Forbidden);
    });

    it('lets a key scoped to the project comment', async () => {
      const here = withKey(world.agentActor, { projects: [projectId], access: 'write' });
      const created = await createComment(ctx, here, { key: taskKey, body: 'in scope' });
      await expect(
        updateComment(ctx, here, { id: created.id, body: 'still in scope' }),
      ).resolves.toMatchObject({
        body: 'still in scope',
      });
    });

    it('lets a read-only key list but not write', async () => {
      const created = await createComment(ctx, world.ownerActor, { key: taskKey, body: 'by session' });
      const readOnly = withKey(world.ownerActor, { projects: 'all', access: 'read' });
      await expect(listComments(ctx, readOnly, { key: taskKey })).resolves.toMatchObject({
        items: expect.arrayContaining([expect.objectContaining({ id: created.id })]),
      });
      await expect(createComment(ctx, readOnly, { key: taskKey, body: 'x' })).rejects.toBeInstanceOf(
        Forbidden,
      );
      // Even the author cannot edit through a read-only key.
      await expect(updateComment(ctx, readOnly, { id: created.id, body: 'x' })).rejects.toBeInstanceOf(
        Forbidden,
      );
      await expect(deleteComment(ctx, readOnly, { id: created.id })).rejects.toBeInstanceOf(Forbidden);
    });
  });
});
