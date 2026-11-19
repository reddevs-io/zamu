import { getActorFromRequest } from '@zamu/auth';
import { schema } from '@zamu/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApiKey, listApiKeys, readKeyMetadata, revokeApiKey } from './api-keys';
import { Forbidden, Invalid, NotFound } from './errors';
import { createAgent } from './members';
import { createProject } from './projects';
import { createWorld, type TestContext, testContext, type World } from './testing/fixtures';

const bearer = (key: string) => ({ headers: new Headers({ authorization: `Bearer ${key}` }) });

describe('API keys', () => {
  let ctx: TestContext;
  let w: World;
  let payId: string;

  beforeAll(async () => {
    ctx = testContext();
    w = await createWorld(ctx.db);
    payId = (await createProject(ctx, w.ownerActor, { name: 'Payments', key: 'PAY' })).id;
  });
  afterAll(async () => {
    await ctx?.close();
  });

  it('creates a key for yourself with the scope in metadata', async () => {
    const created = await createApiKey(ctx, w.memberActor, {
      name: 'My laptop',
      scope: { projects: [payId], access: 'read' },
    });
    expect(created).toMatchObject({
      name: 'My laptop',
      owner: { id: w.member.id, kind: 'person' },
      scope: { projects: [{ id: payId, key: 'PAY' }], access: 'read' },
      revoked: false,
      lastUsedAt: null,
    });
    // `start` is what Better Auth stores for recognition (its length is an @zamu/auth option).
    expect(created.start && created.key.startsWith(created.start)).toBe(true);
    // 14 characters: the zamu_live_ prefix and four random ones.
    expect(created.start).toHaveLength(14);

    const [row] = await ctx.db.select().from(schema.apikey).where(eq(schema.apikey.id, created.id));
    expect(readKeyMetadata(row?.metadata)).toEqual({
      workspaceId: w.workspaceId,
      projects: [payId],
      access: 'read',
    });

    const actor = await getActorFromRequest(ctx, bearer(created.key));
    expect(actor).toMatchObject({ userId: w.member.id, scope: { projects: [payId], access: 'read' } });
    const [listed] = (await listApiKeys(ctx, w.memberActor)).filter((k) => k.id === created.id);
    expect(listed?.lastUsedAt).not.toBeNull();
  });

  it('creates keys for agents only for their responsible human or admins', async () => {
    // world.agent's responsible human is world.member.
    const scope = { projects: 'all' as const, access: 'write' as const };
    await expect(
      createApiKey(ctx, w.memberActor, { name: 'agent', ownerId: w.agent.id, scope }),
    ).resolves.toMatchObject({ owner: { id: w.agent.id } });
    await expect(
      createApiKey(ctx, w.ownerActor, { name: 'agent 2', ownerId: w.agent.id, scope }),
    ).resolves.toBeTruthy();
    // Admins never create keys for other people; agents never create keys.
    await expect(createApiKey(ctx, w.ownerActor, { name: 'x', ownerId: w.member.id, scope })).rejects.toThrow(
      Forbidden,
    );
    await expect(createApiKey(ctx, w.agentActor, { name: 'x', scope })).rejects.toThrow(Forbidden);
    // A read-only key cannot mint keys.
    const readKeyActor = { ...w.memberActor, scope: { projects: 'all' as const, access: 'read' as const } };
    await expect(createApiKey(ctx, readKeyActor, { name: 'x', scope })).rejects.toThrow(Forbidden);

    await expect(
      createApiKey(ctx, w.memberActor, {
        name: 'x',
        scope: { projects: [crypto.randomUUID()], access: 'read' },
      }),
    ).rejects.toThrow(Invalid);
    await expect(createApiKey(ctx, w.memberActor, { name: 'x'.repeat(101), scope })).rejects.toThrow(Invalid);
    await expect(
      createApiKey(ctx, w.memberActor, { name: 'x', ownerId: crypto.randomUUID(), scope }),
    ).rejects.toThrow(NotFound);
  });

  it('lists your keys, an agent’s keys and (for admins) every workspace key', async () => {
    const v = await createWorld(ctx.db);
    const scope = { projects: 'all' as const, access: 'read' as const };
    await createApiKey(ctx, v.memberActor, { name: 'member key', scope });
    await createApiKey(ctx, v.ownerActor, { name: 'owner key', scope });
    await createApiKey(ctx, v.memberActor, { name: 'agent key', ownerId: v.agent.id, scope });

    expect((await listApiKeys(ctx, v.memberActor)).map((k) => k.name)).toEqual(['member key']);
    expect((await listApiKeys(ctx, v.memberActor, { owner: v.agent.id })).map((k) => k.name)).toEqual([
      'agent key',
    ]);
    await expect(listApiKeys(ctx, v.memberActor, { owner: v.owner.id })).rejects.toThrow(Forbidden);
    await expect(listApiKeys(ctx, v.memberActor, { owner: 'all' })).rejects.toThrow(Forbidden);
    const all = await listApiKeys(ctx, v.ownerActor, { owner: 'all' });
    expect(all.map((k) => k.name).sort()).toEqual(['agent key', 'member key', 'owner key']);
    // Keys from other workspaces never show up.
    expect(all.every((k) => [v.owner.id, v.member.id, v.agent.id].includes(k.owner.id))).toBe(true);
  });

  it('revokes keys so they stop working, idempotently', async () => {
    const v = await createWorld(ctx.db);
    const { agent, key } = await createAgent(ctx, v.ownerActor, {
      name: 'rev-bot',
      responsibleUserId: v.member.id,
      scope: { projects: 'all', access: 'write' },
    });
    const personal = await createApiKey(ctx, v.memberActor, {
      name: 'personal',
      scope: { projects: 'all', access: 'write' },
    });

    // Another member cannot revoke; agents cannot revoke.
    const stranger = { ...v.memberActor, userId: v.owner.id, role: 'member' as const };
    await expect(revokeApiKey(ctx, stranger, { id: key.id })).rejects.toThrow(Forbidden);
    await expect(revokeApiKey(ctx, v.agentActor, { id: key.id })).rejects.toThrow(Forbidden);
    // Other workspaces see nothing.
    await expect(revokeApiKey(ctx, w.ownerActor, { id: key.id })).rejects.toThrow(NotFound);

    const revoked = await revokeApiKey(ctx, v.memberActor, { id: key.id });
    expect(revoked).toMatchObject({ id: key.id, revoked: true, owner: { id: agent.id } });
    await expect(revokeApiKey(ctx, v.memberActor, { id: key.id })).resolves.toMatchObject({ revoked: true });
    expect(await getActorFromRequest(ctx, bearer(key.key))).toBeNull();

    // Admins may revoke anyone's key in the workspace.
    await expect(revokeApiKey(ctx, v.ownerActor, { id: personal.id })).resolves.toMatchObject({
      revoked: true,
    });
    expect(await getActorFromRequest(ctx, bearer(personal.key))).toBeNull();
  });
});
