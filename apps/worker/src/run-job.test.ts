// The invitations.expire handler as the worker runs it (core's parsing and handler, the worker's
// logging), against the shared throwaway database.
import { randomUUID } from 'node:crypto';
import { INVITATIONS_EXPIRE } from '@zamu/core';
import { createDb, invitation, organization, user } from '@zamu/db';
import { sharedTestDatabaseUrl } from '@zamu/db/test';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createLogger } from './logger';
import { runJob } from './run-job';

const { db, pool } = createDb(sharedTestDatabaseUrl());
const DAY = 24 * 60 * 60 * 1000;
const lines: Record<string, unknown>[] = [];
const logger = createLogger({ write: (line) => lines.push(JSON.parse(line)) });

let organizationId: string;
let inviterId: string;

beforeAll(async () => {
  const suffix = randomUUID();
  const [inviter] = await db
    .insert(user)
    .values({ name: 'Ada Admin', email: `ada-${suffix}@example.test` })
    .returning({ id: user.id });
  const [workspace] = await db
    .insert(organization)
    .values({ name: 'Reddevs', slug: `reddevs-${suffix}` })
    .returning({ id: organization.id });
  if (!inviter || !workspace) throw new Error('fixture insert failed');
  inviterId = inviter.id;
  organizationId = workspace.id;
});

afterAll(async () => {
  await pool.end();
});

async function invite(status: string, expiresAt: Date): Promise<string> {
  const [row] = await db
    .insert(invitation)
    .values({
      organizationId,
      inviterId,
      email: `${randomUUID()}@example.test`,
      role: 'member',
      status,
      expiresAt,
    })
    .returning({ id: invitation.id });
  if (!row) throw new Error('invitation insert failed');
  return row.id;
}

async function statusOf(id: string): Promise<string | undefined> {
  const result = await pool.query<{ status: string }>('SELECT status FROM invitation WHERE id = $1', [id]);
  return result.rows[0]?.status;
}

const job = (data: unknown) => ({ id: randomUUID(), data, retryCount: 0 });

describe('runJob invitations.expire', () => {
  it('marks pending invitations past their expiry and leaves the rest alone', async () => {
    const now = new Date('2030-01-15T03:00:00Z');
    const expiredPending = await invite('pending', new Date(now.getTime() - DAY));
    const expiresExactlyNow = await invite('pending', now);
    const stillValid = await invite('pending', new Date(now.getTime() + DAY));
    const accepted = await invite('accepted', new Date(now.getTime() - 30 * DAY));
    const canceled = await invite('canceled', new Date(now.getTime() - DAY));
    const run = job({ now: now.toISOString() });

    const output = await runJob(INVITATIONS_EXPIRE, run, { db, logger });

    expect(output).toMatchObject({ expired: expect.any(Number) });
    expect(await statusOf(expiredPending)).toBe('expired');
    expect(await statusOf(expiresExactlyNow)).toBe('expired');
    expect(await statusOf(stillValid)).toBe('pending');
    expect(await statusOf(accepted)).toBe('accepted');
    expect(await statusOf(canceled)).toBe('canceled');
    expect(lines).toContainEqual(
      expect.objectContaining({
        level: 'info',
        msg: 'job completed',
        job: INVITATIONS_EXPIRE,
        jobId: run.id,
      }),
    );

    // A second run at the same time finds nothing left to mark.
    await expect(
      runJob(INVITATIONS_EXPIRE, job({ now: now.toISOString() }), { db, logger }),
    ).resolves.toEqual({
      expired: 0,
    });
  });

  it('uses the current time when the payload has no `now` (the scheduled payload is {})', async () => {
    const expired = await invite('pending', new Date(Date.now() - 60_000));
    // Later than any `now` the other test passes.
    const valid = await invite('pending', new Date(Date.now() + 3650 * DAY));

    await runJob(INVITATIONS_EXPIRE, job({}), { db, logger });
    // pg-boss may hand over null data; core treats it as {}.
    await runJob(INVITATIONS_EXPIRE, job(null), { db, logger });

    expect(await statusOf(expired)).toBe('expired');
    expect(await statusOf(valid)).toBe('pending');
  });

  it('logs and rethrows when the payload does not match the schema, so pg-boss fails the job', async () => {
    const run = job({ now: 'yesterday' });

    await expect(runJob(INVITATIONS_EXPIRE, run, { db, logger })).rejects.toThrow();

    expect(lines).toContainEqual(
      expect.objectContaining({
        level: 'error',
        msg: 'job failed',
        jobId: run.id,
        error: expect.any(Object),
      }),
    );
  });
});
