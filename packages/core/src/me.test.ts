import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Forbidden, Invalid } from './errors';
import { getMe, updateMe } from './me';
import { createProject } from './projects';
import { createWorld, keyActor, type TestContext, testContext, type World } from './testing/fixtures';

describe('me', () => {
  let ctx: TestContext;
  let world: World;

  beforeAll(async () => {
    ctx = testContext();
    world = await createWorld(ctx.db);
  });
  afterAll(async () => {
    await ctx?.close();
  });

  it('describes a session caller with the default theme', async () => {
    const me = await getMe(ctx, world.memberActor);
    expect(me).toMatchObject({
      user: {
        id: world.member.id,
        kind: 'person',
        email: world.member.email,
        theme: 'system',
        responsible: null,
      },
      workspace: { id: world.workspaceId },
      role: 'member',
      auth: { method: 'session', scope: null },
    });
  });

  it('describes an agent key with its scope and responsible human', async () => {
    const project = await createProject(ctx, world.ownerActor, { name: 'Payments', key: 'PAY' });
    const me = await getMe(ctx, keyActor(world, { projects: [project.id], access: 'read' }));
    expect(me).toMatchObject({
      user: {
        id: world.agent.id,
        kind: 'agent',
        email: null,
        theme: 'system',
        responsible: { id: world.member.id },
      },
      auth: { method: 'api_key', scope: { projects: [{ id: project.id, key: 'PAY' }], access: 'read' } },
    });
  });

  it('saves the theme for people signed in with a session', async () => {
    const dark = await updateMe(ctx, world.ownerActor, { theme: 'dark' });
    expect(dark.user.theme).toBe('dark');
    await expect(getMe(ctx, world.ownerActor)).resolves.toMatchObject({ user: { theme: 'dark' } });
    await expect(updateMe(ctx, world.ownerActor, { theme: 'light' })).resolves.toMatchObject({
      user: { theme: 'light' },
    });
    // Other users keep theirs.
    await expect(getMe(ctx, world.memberActor)).resolves.toMatchObject({ user: { theme: 'system' } });
    await expect(updateMe(ctx, world.ownerActor, { theme: 'blue' as never })).rejects.toThrow(Invalid);
  });

  it('rejects the theme for API keys, people included, and for agents', async () => {
    const personKey = {
      ...world.ownerActor,
      scope: { projects: 'all' as const, access: 'write' as const },
      apiKeyId: crypto.randomUUID(),
    };
    await expect(updateMe(ctx, personKey, { theme: 'dark' })).rejects.toThrow(Forbidden);
    await expect(updateMe(ctx, world.agentActor, { theme: 'dark' })).rejects.toThrow(/not with an API key/);
    // An agent without a key (not a real path today) is still refused.
    const { scope: _scope, apiKeyId: _key, ...agentSession } = world.agentActor;
    await expect(updateMe(ctx, agentSession, { theme: 'dark' })).rejects.toThrow(Forbidden);
    await expect(getMe(ctx, world.agentActor)).resolves.toMatchObject({ user: { theme: 'system' } });
  });
});
