import { createDb, type Db, type DbHandle, schema } from '@zamu/db';
import { sharedTestDatabaseUrl } from '@zamu/db/test';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearerApiKey, getActorFromRequest } from './actor';
import { type ApiKeyMetadata, parseApiKeyMetadata } from './api-key';
import { cookieHeaders, testAuth } from './testing/helpers';

// Runs on the shared database from @zamu/db's globalSetup; every row here uses fresh ids and emails.
describe('getActorFromRequest', () => {
  let db: Db;
  let pool: DbHandle['pool'];
  let auth: ReturnType<typeof testAuth>;
  let workspaceId: string;
  let otherWorkspaceId: string;
  let human: { id: string };
  let agent: { id: string };
  const projectId = crypto.randomUUID();

  const bearer = (key: string) => ({ headers: new Headers({ authorization: `Bearer ${key}` }) });

  async function createUser(values: Partial<typeof schema.user.$inferInsert> & { name: string }) {
    const [row] = await db
      .insert(schema.user)
      .values({ email: `${crypto.randomUUID()}@example.com`, ...values })
      .returning();
    if (!row) throw new Error('user insert failed');
    return row;
  }

  async function createKey(userId: string, metadata: unknown) {
    return auth.api.createApiKey({ body: { userId, name: 'test key', metadata } });
  }

  beforeAll(async () => {
    ({ db, pool } = createDb(sharedTestDatabaseUrl()));
    auth = testAuth(db);
    const [workspace, other] = await db
      .insert(schema.organization)
      .values([
        { name: 'Reddevs', slug: `reddevs-${crypto.randomUUID()}` },
        { name: 'Elsewhere', slug: `elsewhere-${crypto.randomUUID()}` },
      ])
      .returning();
    if (!workspace || !other) throw new Error('organization insert failed');
    workspaceId = workspace.id;
    otherWorkspaceId = other.id;

    human = await createUser({ name: 'Ada' });
    agent = await createUser({ name: 'claude-dev', kind: 'agent', responsibleUserId: human.id });
    await db.insert(schema.member).values([
      { organizationId: workspaceId, userId: human.id, role: 'admin' },
      { organizationId: workspaceId, userId: agent.id, role: 'member' },
    ]);
  });

  afterAll(async () => {
    await pool?.end();
  });

  it('resolves an agent key with project scope and the responsible human', async () => {
    const metadata: ApiKeyMetadata = { workspaceId, projects: [projectId], access: 'read' };
    const created = await createKey(agent.id, metadata);
    expect(created.key.startsWith('zamu_live_')).toBe(true);

    const [stored] = await db.select().from(schema.apikey).where(eq(schema.apikey.id, created.id));
    expect(stored?.key).not.toBe(created.key);
    expect(stored?.referenceId).toBe(agent.id);
    expect(stored?.rateLimitEnabled).toBe(false);

    const actor = await getActorFromRequest({ auth, db }, bearer(created.key));
    expect(actor).toEqual({
      userId: agent.id,
      kind: 'agent',
      workspaceId,
      role: 'member',
      scope: { projects: [projectId], access: 'read' },
      onBehalfOfId: human.id,
      apiKeyId: created.id,
    });
  });

  it('resolves a person key with workspace scope and no onBehalfOf', async () => {
    const created = await createKey(human.id, { workspaceId, projects: 'all', access: 'write' });
    const actor = await getActorFromRequest({ auth, db }, bearer(created.key));
    expect(actor).toMatchObject({
      userId: human.id,
      kind: 'person',
      role: 'admin',
      scope: { projects: 'all', access: 'write' },
      onBehalfOfId: null,
    });
  });

  it('keeps working past the plugin default of 10 requests per day', async () => {
    const created = await createKey(agent.id, { workspaceId, projects: 'all', access: 'read' });
    for (let i = 0; i < 12; i++) {
      expect(await getActorFromRequest({ auth, db }, bearer(created.key))).not.toBeNull();
    }
  });

  it('returns null for unknown, disabled, unscoped or foreign-workspace keys', async () => {
    expect(await getActorFromRequest({ auth, db }, bearer('zamu_live_not-a-real-key'))).toBeNull();

    const disabled = await createKey(agent.id, { workspaceId, projects: 'all', access: 'read' });
    await db.update(schema.apikey).set({ enabled: false }).where(eq(schema.apikey.id, disabled.id));
    expect(await getActorFromRequest({ auth, db }, bearer(disabled.key))).toBeNull();

    const unscoped = await createKey(agent.id, { workspaceId, access: 'admin' });
    expect(await getActorFromRequest({ auth, db }, bearer(unscoped.key))).toBeNull();

    const foreign = await createKey(agent.id, {
      workspaceId: otherWorkspaceId,
      projects: 'all',
      access: 'read',
    });
    expect(await getActorFromRequest({ auth, db }, bearer(foreign.key))).toBeNull();
  });

  it('refuses an agent without a responsible human', async () => {
    const orphan = await createUser({ name: 'orphan-agent', kind: 'agent' });
    await db.insert(schema.member).values({ organizationId: workspaceId, userId: orphan.id });
    const created = await createKey(orphan.id, { workspaceId, projects: 'all', access: 'read' });
    expect(await getActorFromRequest({ auth, db }, bearer(created.key))).toBeNull();
  });

  it('returns null without credentials and ignores non-zamu bearer tokens', async () => {
    expect(await getActorFromRequest({ auth, db }, { headers: new Headers() })).toBeNull();
    expect(await getActorFromRequest({ auth, db }, bearer('some-jwt-token'))).toBeNull();
    expect(bearerApiKey(new Headers({ authorization: 'bearer zamu_live_abc' }))).toBe('zamu_live_abc');
    expect(bearerApiKey(new Headers({ authorization: 'Basic zamu_live_abc' }))).toBeNull();
  });

  it('resolves a session, falling back to the oldest membership', async () => {
    const email = `${crypto.randomUUID()}@example.com`;
    await db.insert(schema.invitation).values({
      organizationId: workspaceId,
      email,
      role: 'member',
      inviterId: human.id,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const signUp = await auth.api.signUpEmail({
      body: { name: 'Carol', email, password: 'long enough password' },
      returnHeaders: true,
    });
    const headers = cookieHeaders(signUp.headers);
    const userId = signUp.response.user.id;

    // Signed in but not a member of any workspace yet.
    expect(await getActorFromRequest({ auth, db }, { headers })).toBeNull();

    await db.insert(schema.member).values({ organizationId: workspaceId, userId, role: 'member' });
    expect(
      await getActorFromRequest({ auth, db }, new Request('http://localhost:3000/', { headers })),
    ).toEqual({
      userId,
      kind: 'person',
      workspaceId,
      role: 'member',
      onBehalfOfId: null,
    });
  });
});

describe('parseApiKeyMetadata', () => {
  const workspaceId = '0190b1d2-0000-7000-8000-000000000000';

  it('accepts objects and JSON strings', () => {
    expect(parseApiKeyMetadata({ workspaceId, projects: 'all', access: 'write' })).toEqual({
      workspaceId,
      projects: 'all',
      access: 'write',
    });
    expect(parseApiKeyMetadata(JSON.stringify({ workspaceId, projects: ['p1'], access: 'read' }))).toEqual({
      workspaceId,
      projects: ['p1'],
      access: 'read',
    });
  });

  it.each([
    null,
    'not json',
    [],
    { projects: 'all', access: 'read' },
    { workspaceId, projects: 'some', access: 'read' },
    { workspaceId, projects: [1], access: 'read' },
    { workspaceId, projects: 'all', access: 'admin' },
  ])('rejects %j', (value) => {
    expect(parseApiKeyMetadata(value)).toBeNull();
  });
});
