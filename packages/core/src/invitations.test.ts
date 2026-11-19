import { hasPendingInvitation } from '@zamu/auth';
import { schema } from '@zamu/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Conflict, Forbidden, NotFound } from './errors';
import { cancelInvitation, createInvitation, expireInvitations, listInvitations } from './invitations';
import { runJob } from './job-handlers';
import { INVITATIONS_EXPIRE } from './jobs';
import { createWorld, TEST_PUBLIC_URL, type TestContext, testContext, type World } from './testing/fixtures';

describe('invitations', () => {
  let ctx: TestContext;
  let w: World;

  beforeAll(async () => {
    ctx = testContext();
    w = await createWorld(ctx.db);
  });
  afterAll(async () => {
    await ctx?.close();
  });

  const email = () => `${crypto.randomUUID()}@example.com`;

  it('creates a 7-day link that lets the invited email sign up', async () => {
    const address = email();
    const before = Date.now();
    const invitation = await createInvitation(ctx, w.ownerActor, {
      email: address.toUpperCase(),
      role: 'admin',
    });
    expect(invitation).toMatchObject({
      email: address,
      role: 'admin',
      status: 'pending',
      invitedBy: { id: w.owner.id },
      link: `${TEST_PUBLIC_URL}/invite/${invitation.id}`,
    });
    const days = (Date.parse(invitation.expiresAt) - before) / 86_400_000;
    expect(days).toBeGreaterThan(6.99);
    expect(days).toBeLessThan(7.01);
    expect(await hasPendingInvitation(ctx.db, address)).toBe(true);
  });

  it('is admin-only, refuses existing members and replaces earlier invitations', async () => {
    await expect(createInvitation(ctx, w.memberActor, { email: email() })).rejects.toThrow(Forbidden);
    await expect(createInvitation(ctx, w.ownerActor, { email: w.member.email })).rejects.toThrow(Conflict);

    const address = email();
    const first = await createInvitation(ctx, w.ownerActor, { email: address });
    const second = await createInvitation(ctx, w.ownerActor, { email: address });
    const [firstRow] = await ctx.db
      .select()
      .from(schema.invitation)
      .where(eq(schema.invitation.id, first.id));
    expect(firstRow?.status).toBe('canceled');

    const pending = await listInvitations(ctx, w.ownerActor);
    expect(pending.map((i) => i.id)).toContain(second.id);
    expect(pending.map((i) => i.id)).not.toContain(first.id);
    // Members see pending invitations without the link.
    const asMember = await listInvitations(ctx, w.memberActor);
    expect(asMember.find((i) => i.id === second.id)?.link).toBeNull();

    await expect(cancelInvitation(ctx, w.memberActor, { id: second.id })).rejects.toThrow(Forbidden);
    await expect(cancelInvitation(ctx, w.ownerActor, { id: second.id })).resolves.toMatchObject({
      status: 'canceled',
    });
    await expect(cancelInvitation(ctx, w.ownerActor, { id: second.id })).rejects.toThrow(NotFound);
    expect(await hasPendingInvitation(ctx.db, address)).toBe(false);
  });

  it('expires pending invitations past their date, through the job handler', async () => {
    const v = await createWorld(ctx.db);
    const fresh = await createInvitation(ctx, v.ownerActor, { email: email() });
    const old = await createInvitation(ctx, v.ownerActor, { email: email() });
    await ctx.db
      .update(schema.invitation)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.invitation.id, old.id));

    // Before the job runs, the list already reports it as expired.
    const listed = await listInvitations(ctx, v.ownerActor);
    expect(listed.find((i) => i.id === old.id)?.status).toBe('expired');

    const result = (await runJob(ctx, INVITATIONS_EXPIRE, {})) as { expired: number };
    expect(result.expired).toBeGreaterThanOrEqual(1);
    const [oldRow] = await ctx.db.select().from(schema.invitation).where(eq(schema.invitation.id, old.id));
    const [freshRow] = await ctx.db
      .select()
      .from(schema.invitation)
      .where(eq(schema.invitation.id, fresh.id));
    expect(oldRow?.status).toBe('expired');
    expect(freshRow?.status).toBe('pending');
    expect((await listInvitations(ctx, v.ownerActor)).map((i) => i.id)).toEqual([fresh.id]);

    // `now` moves the clock: everything expires a week from now.
    const later = new Date(Date.now() + 8 * 86_400_000);
    await expireInvitations(ctx, { now: later });
    expect(await listInvitations(ctx, v.ownerActor)).toEqual([]);
    await expect(runJob(ctx, INVITATIONS_EXPIRE, { now: 'yesterday' })).rejects.toThrow();
  });
});
