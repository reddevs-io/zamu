import { schema } from '@pm/db';
import { createTestDatabase, type TestDatabase } from '@pm/db/test';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { bootstrapAdmin } from './bootstrap';
import { AcceptInvitationError, acceptInvitationWithSignUp } from './invitation';
import { cookieHeaders, testAuth } from './testing/helpers';

describe('acceptInvitationWithSignUp', () => {
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

  async function usersWithEmail(email: string) {
    return database.db.select().from(schema.user).where(eq(schema.user.email, email));
  }

  async function invitationStatus(id: string) {
    const [row] = await database.db
      .select({ status: schema.invitation.status })
      .from(schema.invitation)
      .where(eq(schema.invitation.id, id));
    return row?.status;
  }

  function accept(invitationId: string, name = 'Tomás Berg', password = 'long enough password') {
    return acceptInvitationWithSignUp({ auth, db: database.db }, { invitationId, name, password });
  }

  async function errorCode(promise: Promise<unknown>) {
    const error = await promise.catch((e) => e);
    expect(error).toBeInstanceOf(AcceptInvitationError);
    return (error as AcceptInvitationError).code;
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

  it('creates the person with the invited email, signs them in and adds them to the workspace', async () => {
    const invitation = await invite('tomas@example.com');
    const result = await accept(invitation.id);

    expect(result.workspaceId).toBe(workspaceId);
    const [user] = await usersWithEmail('tomas@example.com');
    expect(user).toMatchObject({ id: result.userId, name: 'Tomás Berg', kind: 'person' });
    expect(await invitationStatus(invitation.id)).toBe('accepted');
    const members = await database.db
      .select({ role: schema.member.role, organizationId: schema.member.organizationId })
      .from(schema.member)
      .where(eq(schema.member.userId, result.userId));
    expect(members).toEqual([{ role: 'member', organizationId: workspaceId }]);

    // The returned cookies are a working session for the new person, in the invited workspace.
    const headers = new Headers({
      cookie: result.setCookies.map((cookie) => cookie.split(';')[0]).join('; '),
    });
    const session = await auth.api.getSession({ headers });
    expect(session?.user.email).toBe('tomas@example.com');
    const active = (session?.session as { activeOrganizationId?: string } | undefined)?.activeOrganizationId;
    expect(active).toBe(workspaceId);
  });

  it('refuses an id that is not a pending invitation', async () => {
    expect(await errorCode(accept('00000000-0000-4000-8000-000000000000'))).toBe('INVITATION_NOT_USABLE');
    expect(await errorCode(accept('not-a-uuid'))).toBe('INVITATION_NOT_USABLE');

    const used = await invite('used@example.com');
    await accept(used.id, 'Used');
    expect(await errorCode(accept(used.id, 'Again'))).toBe('INVITATION_NOT_USABLE');

    const canceled = await invite('canceled@example.com');
    await auth.api.cancelInvitation({ headers: adminHeaders, body: { invitationId: canceled.id } });
    expect(await errorCode(accept(canceled.id))).toBe('INVITATION_NOT_USABLE');
    expect(await usersWithEmail('canceled@example.com')).toEqual([]);
  });

  it('refuses when the invited email already has an account', async () => {
    const invitation = await invite('taken@example.com');
    await auth.api.signUpEmail({
      body: { name: 'Taken', email: 'taken@example.com', password: 'long enough password' },
    });
    expect(await errorCode(accept(invitation.id))).toBe('ACCOUNT_EXISTS');
    expect(await usersWithEmail('taken@example.com')).toHaveLength(1);
    expect(await invitationStatus(invitation.id)).toBe('pending');
  });

  it('refuses an expired invitation', async () => {
    const invitation = await invite('late@example.com');
    const later = new Date(invitation.expiresAt.getTime() + 1000);
    const code = await errorCode(
      acceptInvitationWithSignUp(
        { auth, db: database.db },
        { invitationId: invitation.id, name: 'Late', password: 'long enough password' },
        { now: later },
      ),
    );
    expect(code).toBe('INVITATION_NOT_USABLE');
    expect(await usersWithEmail('late@example.com')).toEqual([]);
  });

  it('validates name and password before creating anything', async () => {
    const invitation = await invite('short@example.com');
    expect(await errorCode(accept(invitation.id, ' '))).toBe('INVALID_INPUT');
    expect(await errorCode(accept(invitation.id, 'Short', 'elevenchars'))).toBe('INVALID_INPUT');
    expect(await usersWithEmail('short@example.com')).toEqual([]);
    expect(await invitationStatus(invitation.id)).toBe('pending');
  });

  it('removes the new user again when accepting fails', async () => {
    const invitation = await invite('orphan@example.com');
    const spy = vi.spyOn(auth.api, 'acceptInvitation').mockRejectedValueOnce(new Error('database went away'));
    try {
      await expect(accept(invitation.id)).rejects.toThrow('database went away');
    } finally {
      spy.mockRestore();
    }
    expect(await usersWithEmail('orphan@example.com')).toEqual([]);
    expect(await invitationStatus(invitation.id)).toBe('pending');

    // The invitation still works afterwards.
    await accept(invitation.id);
    expect(await invitationStatus(invitation.id)).toBe('accepted');
  });

  it('only one of two concurrent accepts wins', async () => {
    const invitation = await invite('race@example.com');
    const results = await Promise.allSettled([accept(invitation.id, 'One'), accept(invitation.id, 'Two')]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await usersWithEmail('race@example.com')).toHaveLength(1);
    expect(await invitationStatus(invitation.id)).toBe('accepted');
  });
});
