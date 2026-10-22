import { sql } from 'drizzle-orm';
import { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createJobQueue,
  enqueue,
  ensureQueues,
  INVITATIONS_EXPIRE,
  isJobName,
  JOB_NAMES,
  JOB_SCHEDULES,
  parseJobPayload,
} from './jobs';
import { type TestContext, testContext } from './testing/fixtures';

describe('jobs', () => {
  let ctx: TestContext;
  let boss: PgBoss;

  beforeAll(async () => {
    ctx = testContext();
    // Producer-only instance: no maintenance or cron loops in tests.
    boss = new PgBoss({ connectionString: ctx.url, supervise: false, schedule: false });
    boss.on('error', () => {});
    await boss.start();
    await ensureQueues(boss);
  }, 60_000);
  afterAll(async () => {
    await boss?.stop({ graceful: false });
    await ctx?.close();
  });

  async function jobCount(id: string): Promise<number> {
    const result = await ctx.db.execute<{ n: number }>(
      sql`select count(*)::int as n from pgboss.job where id = ${id}`,
    );
    return result.rows[0]?.n ?? 0;
  }

  it('exports names, payload schemas and the daily schedule', () => {
    expect(JOB_NAMES).toEqual(['invitations.expire']);
    expect(isJobName('invitations.expire')).toBe(true);
    expect(isJobName('nope')).toBe(false);
    expect(JOB_SCHEDULES[INVITATIONS_EXPIRE]).toEqual({ cron: '0 3 * * *', tz: 'UTC', data: {} });
    expect(parseJobPayload(INVITATIONS_EXPIRE, null)).toEqual({});
    expect(() => parseJobPayload(INVITATIONS_EXPIRE, { now: 'soon' })).toThrow();
  });

  it('keeps a job sent inside a committed transaction', async () => {
    const id = await ctx.db.transaction((tx) => enqueue(boss, tx, INVITATIONS_EXPIRE, {}));
    expect(id).toBeTruthy();
    expect(await jobCount(id as string)).toBe(1);
    const job = await boss.getJobById(INVITATIONS_EXPIRE, id as string);
    expect(job?.data).toEqual({});
  });

  it('leaves no job when the transaction rolls back', async () => {
    let jobId: string | null = null;
    await expect(
      ctx.db.transaction(async (tx) => {
        jobId = await createJobQueue(boss).enqueue(tx, INVITATIONS_EXPIRE, {});
        // Visible inside the transaction...
        const inside = await tx.execute<{ n: number }>(
          sql`select count(*)::int as n from pgboss.job where id = ${jobId}`,
        );
        expect(inside.rows[0]?.n).toBe(1);
        throw new Error('roll back');
      }),
    ).rejects.toThrow('roll back');
    expect(jobId).toBeTruthy();
    // ...and gone after the rollback.
    expect(await jobCount(jobId as unknown as string)).toBe(0);
  });

  it('validates payloads before sending', async () => {
    await expect(
      ctx.db.transaction((tx) => enqueue(boss, tx, INVITATIONS_EXPIRE, { now: 'not a date' })),
    ).rejects.toThrow();
  });
});
