// The web server's pg-boss producer against a fresh database (pg-boss installs its schema on the
// first enqueue when the worker has not run yet).
import { BACKLOG_REFRESH } from '@pm/core';
import { createTestDatabase, type TestDatabase } from '@pm/db/test';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createJobProducer, type JobProducer } from './jobs';

let database: TestDatabase;
let producer: JobProducer;

beforeAll(async () => {
  database = await createTestDatabase({ prefix: 'pm_web_jobs' });
  database.pool.on('error', () => {});
  producer = createJobProducer(database.url);
}, 60_000);

afterAll(async () => {
  await producer?.stop();
  await database?.drop();
});

async function jobsFor(sourceId: string) {
  const result = await database.pool.query<{ name: string; data: { sourceId: string; trigger: string } }>(
    "SELECT name, data FROM pgboss.job WHERE data->>'sourceId' = $1",
    [sourceId],
  );
  return result.rows;
}

describe('createJobProducer', () => {
  it('opens nothing until the first enqueue', async () => {
    const schema = await database.pool.query(
      "SELECT 1 FROM information_schema.schemata WHERE schema_name = 'pgboss'",
    );
    expect(schema.rowCount).toBe(0);
  });

  it('sends inside the caller transaction: the job exists only if it commits', async () => {
    const committed = crypto.randomUUID();
    const id = await database.db.transaction((tx) =>
      producer.enqueue(
        tx,
        BACKLOG_REFRESH,
        { sourceId: committed, trigger: 'manual' },
        { singletonKey: committed },
      ),
    );
    expect(id).toEqual(expect.any(String));
    expect(await jobsFor(committed)).toEqual([
      { name: BACKLOG_REFRESH, data: { sourceId: committed, trigger: 'manual' } },
    ]);

    const rolledBack = crypto.randomUUID();
    await expect(
      database.db.transaction(async (tx) => {
        await producer.enqueue(
          tx,
          BACKLOG_REFRESH,
          { sourceId: rolledBack, trigger: 'manual' },
          { singletonKey: rolledBack },
        );
        throw new Error('roll back');
      }),
    ).rejects.toThrow('roll back');
    expect(await jobsFor(rolledBack)).toEqual([]);
  });

  it('stops cleanly and starts again on the next enqueue', async () => {
    await producer.stop();
    await producer.stop();
    const sourceId = crypto.randomUUID();
    // backlog.refresh is a stately queue: one queued job per singleton key.
    const id = await database.db.transaction((tx) =>
      producer.enqueue(tx, BACKLOG_REFRESH, { sourceId, trigger: 'webhook' }, { singletonKey: sourceId }),
    );
    expect(id).toEqual(expect.any(String));
    expect(await jobsFor(sourceId)).toHaveLength(1);
  });
});
