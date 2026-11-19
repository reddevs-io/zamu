import { schema } from '@zamu/db';
import { createTestDatabase, type TestDatabase } from '@zamu/db/test';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootstrapAdmin } from './bootstrap';
import { cookieHeaders, testAuth } from './testing/helpers';

describe('sign-up', () => {
  let database: TestDatabase;
  let auth: ReturnType<typeof testAuth>;
  let adminHeaders: Headers;
  let workspaceId: string;

  async function invite(email: string) {
    return auth.api.createInvitation({
      headers: adminHeaders,
      body: { email, role: 'member', organizationId: workspaceId },
    });
  }

  beforeAll(async () => {
    database = await createTestDatabase();
    auth = testAuth(database.db);
    const result = await bootstrapAdmin(
      { auth, db: database.db },
      { name: 'Ada', email: 'ada@example.com', password: 'correct horse battery', workspaceName: 'Reddevs' },
    );
    workspaceId = result.workspaceId;
    const signIn = await auth.api.signInEmail({
      body: { email: 'ada@example.com', password: 'correct horse battery' },
      returnHeaders: true,
    });
    adminHeaders = cookieHeaders(signIn.headers);
  });

  afterAll(async () => {
    await database?.drop();
  });

  it('is refused without a pending invitation', async () => {
    const error = await auth.api
      .signUpEmail({
        body: { name: 'Mallory', email: 'mallory@example.com', password: 'long enough password' },
      })
      .catch((e) => e);
    expect(error?.body?.code).toBe('SIGN_UP_REQUIRES_INVITATION');
    expect(
      await database.db.select().from(schema.user).where(eq(schema.user.email, 'mallory@example.com')),
    ).toEqual([]);
  });

  it('ignores kind in the sign-up body: the user is always a person', async () => {
    const invitation = await invite('bob@example.com');
    expect(invitation.expiresAt.getTime() - Date.now()).toBeGreaterThan(6.9 * 24 * 60 * 60 * 1000);

    const body = { name: 'Bob', email: 'bob@example.com', password: 'long enough password', kind: 'agent' };
    const result = await auth.api.signUpEmail({ body });

    expect(result.user.kind).toBe('person');
    const rows = await database.db.select().from(schema.user).where(eq(schema.user.email, 'bob@example.com'));
    expect(rows).toEqual([expect.objectContaining({ kind: 'person', responsibleUserId: null })]);
  });

  function httpSignUp(body: Record<string, unknown>, path = '/api/auth/sign-up/email') {
    return auth.handler(
      new Request(`http://localhost:3000${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
        body: JSON.stringify(body),
      }),
    );
  }

  it('is always refused over HTTP, even for an invited email', async () => {
    await invite('frank@example.com');
    const response = await httpSignUp({
      name: 'Frank',
      email: 'frank@example.com',
      password: 'long enough password',
      kind: 'agent',
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'SIGN_UP_DISABLED' });
    expect(
      await database.db.select().from(schema.user).where(eq(schema.user.email, 'frank@example.com')),
    ).toEqual([]);
  });

  it('is refused over HTTP without an invitation', async () => {
    const response = await httpSignUp({
      name: 'Mallory',
      email: 'mallory2@example.com',
      password: 'long enough password',
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'SIGN_UP_DISABLED' });
  });

  it('rejects responsibleUserId in the sign-up body', async () => {
    await invite('erin@example.com');
    const body = {
      name: 'Erin',
      email: 'erin@example.com',
      password: 'long enough password',
      responsibleUserId: '0190b1d2-0000-7000-8000-000000000000',
    };
    const error = await auth.api.signUpEmail({ body }).catch((e) => e);

    expect(error?.statusCode).toBe(400);
    expect(error?.body).toEqual({
      code: 'FIELD_NOT_ALLOWED',
      message: 'responsibleUserId is not allowed to be set',
    });
    expect(
      await database.db.select().from(schema.user).where(eq(schema.user.email, 'erin@example.com')),
    ).toEqual([]);
  });

  it('creates a person when an invitation exists', async () => {
    await invite('carol@example.com');
    const result = await auth.api.signUpEmail({
      body: { name: 'Carol', email: 'Carol@Example.com', password: 'long enough password' },
    });
    expect(result.user).toMatchObject({ email: 'carol@example.com', kind: 'person' });
  });

  it('rejects passwords under 12 characters', async () => {
    await invite('dan@example.com');
    const error = await auth.api
      .signUpEmail({ body: { name: 'Dan', email: 'dan@example.com', password: 'elevenchars' } })
      .catch((e) => e);
    expect(error?.body?.code).toBe('PASSWORD_TOO_SHORT');
  });
});
