import { schema } from '@pm/db';
import { createTestDatabase, type TestDatabase } from '@pm/db/test';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { getActorFromRequest } from './actor';
import { BootstrapError, bootstrapAdmin, isFirstRun, slugify } from './bootstrap';
import { cookieHeaders, testAuth } from './testing/helpers';

const admin = {
  name: 'Ada Lovelace',
  email: 'Ada@Example.com',
  password: 'correct horse battery',
  workspaceName: 'Reddevs',
};

describe('first-run bootstrap', () => {
  let database: TestDatabase | undefined;

  afterEach(async () => {
    await database?.drop();
    database = undefined;
  });

  it('creates the admin, the workspace and the owner membership, then signs in', async () => {
    database = await createTestDatabase();
    const { db } = database;
    const auth = testAuth(db);

    expect(await isFirstRun(db)).toBe(true);
    const { userId, workspaceId } = await bootstrapAdmin({ auth, db }, admin);
    expect(await isFirstRun(db)).toBe(false);

    const [user] = await db.select().from(schema.user).where(eq(schema.user.id, userId));
    expect(user).toMatchObject({ name: 'Ada Lovelace', email: 'ada@example.com', kind: 'person' });
    const [workspace] = await db
      .select()
      .from(schema.organization)
      .where(eq(schema.organization.id, workspaceId));
    expect(workspace).toMatchObject({ name: 'Reddevs', slug: 'reddevs' });
    const members = await db.select().from(schema.member).where(eq(schema.member.userId, userId));
    expect(members).toEqual([expect.objectContaining({ organizationId: workspaceId, role: 'owner' })]);

    const signIn = await auth.api.signInEmail({
      body: { email: 'ada@example.com', password: admin.password },
      returnHeaders: true,
    });
    const actor = await getActorFromRequest({ auth, db }, { headers: cookieHeaders(signIn.headers) });
    expect(actor).toEqual({ userId, kind: 'person', workspaceId, role: 'owner', onBehalfOfId: null });
  });

  it('refuses a second bootstrap', async () => {
    database = await createTestDatabase();
    const { db } = database;
    const auth = testAuth(db);
    await bootstrapAdmin({ auth, db }, admin);

    const error = await bootstrapAdmin({ auth, db }, { ...admin, email: 'eve@example.com' }).catch((e) => e);
    expect(error).toBeInstanceOf(BootstrapError);
    expect(error.code).toBe('ALREADY_SET_UP');
    expect(await db.select().from(schema.user)).toHaveLength(1);
  });

  it('lets only one of two concurrent bootstraps win', async () => {
    database = await createTestDatabase();
    const { db } = database;
    const auth = testAuth(db);
    const results = await Promise.allSettled([
      bootstrapAdmin({ auth, db }, admin),
      bootstrapAdmin({ auth, db }, { ...admin, email: 'eve@example.com' }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await db.select().from(schema.organization)).toHaveLength(1);
  });

  it('validates input before touching the database', async () => {
    database = await createTestDatabase();
    const { db } = database;
    const auth = testAuth(db);
    const error = await bootstrapAdmin({ auth, db }, { ...admin, password: 'short' }).catch((e) => e);
    expect(error).toBeInstanceOf(BootstrapError);
    expect(error.code).toBe('INVALID_INPUT');
    expect(await isFirstRun(db)).toBe(true);
  });

  it('slugifies workspace names', () => {
    expect(slugify('Reddevs  Ops!')).toBe('reddevs-ops');
    expect(slugify('Équipe Café')).toBe('equipe-cafe');
    expect(slugify('***')).toBe('workspace');
  });
});
