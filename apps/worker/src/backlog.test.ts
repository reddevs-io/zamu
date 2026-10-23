// The Backlog.md jobs as the worker runs them: the worker passes the encryption key, the git host
// settings, the provider factory and its own job queue to core, so a refresh reads the repository
// (a fake provider here) and the hourly poll can queue refreshes.
import { BACKLOG_POLL, BACKLOG_REFRESH, createJobQueue, enqueueBacklogRefresh } from '@pm/core';
import {
  configFile,
  createMirror,
  FakeProvider,
  FakeRepository,
  fakeProviderFactory,
  mirrorContext,
  TEST_ENCRYPTION_KEY,
  taskFile,
  taskPath,
  tasksByKey,
} from '@pm/core/backlog/testing';
import { createWorld, type TestContext } from '@pm/core/testing/fixtures';
import { createTestDatabase, type TestDatabase } from '@pm/db/test';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createLogger } from './logger';
import { startWorker, type Worker } from './worker';

let database: TestDatabase;
let worker: Worker | undefined;
const lines: Record<string, unknown>[] = [];
const logger = createLogger({ level: 'debug', write: (line) => lines.push(JSON.parse(line)) });

const repo = new FakeRepository('reddevs/payments', {
  'backlog/config.yml': configFile(),
  [taskPath('backlog', 'BACK-1', 'First')]: taskFile({ id: 'BACK-1', title: 'First' }),
  [taskPath('backlog', 'BACK-1.1', 'Child')]: taskFile({ id: 'BACK-1.1', title: 'Child', parent: 'BACK-1' }),
});
const provider = new FakeProvider([repo]);

beforeAll(async () => {
  database = await createTestDatabase({ prefix: 'pm_worker_backlog' });
  database.pool.on('error', () => {});
  worker = await startWorker({
    databaseUrl: database.url,
    logger,
    pollingIntervalSeconds: 0.5,
    shutdownTimeoutMs: 2_000,
    git: {
      encryptionKey: TEST_ENCRYPTION_KEY,
      gitHosts: { allowPrivate: false, httpHosts: [] },
      providerFactory: fakeProviderFactory(provider),
    },
  });
}, 60_000);

afterAll(async () => {
  await worker?.stop();
  await database?.drop();
});

async function waitForJob(name: string, id: string, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const [job] = (await worker?.boss.findJobs(name, { id })) ?? [];
    if (job && (job.state === 'completed' || job.state === 'failed')) return job;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`job ${id} did not finish within ${timeoutMs} ms`);
}

describe('Backlog.md jobs in the worker', () => {
  let sourceId: string;
  let projectId: string;
  let projectKey: string;

  it('runs a queued backlog.refresh with the git settings and records the outcome', async () => {
    if (!worker) throw new Error('worker not started');
    // Core's test context on this database; only db and the fields mirrorContext adds are used.
    const base = { db: database.db, publicUrl: 'http://localhost:3000' } as unknown as TestContext;
    const ctx = mirrorContext(base, provider);
    const world = await createWorld(database.db);
    const mirror = await createMirror(ctx, world, repo, { refresh: false });
    sourceId = mirror.sourceId;
    projectId = mirror.project.id;
    projectKey = mirror.key;

    const jobs = createJobQueue(worker.boss);
    const id = await database.db.transaction((tx) => enqueueBacklogRefresh({ jobs }, tx, sourceId, 'manual'));
    if (!id) throw new Error('refresh not queued');
    const job = await waitForJob(BACKLOG_REFRESH, id);

    expect(job.state).toBe('completed');
    // No mappings were given, so the statuses fall back: warnings.
    expect(job.output).toMatchObject({ outcome: 'applied', state: 'warnings', commit: repo.head });
    const tasks = await tasksByKey(database.db, projectId, projectKey);
    expect([...tasks.keys()].sort()).toEqual([`${projectKey}-1`, `${projectKey}-1.1`]);
    expect(lines).toContainEqual(
      expect.objectContaining({ msg: 'job completed', job: BACKLOG_REFRESH, jobId: id }),
    );
    // Logs never carry the token.
    expect(JSON.stringify(lines)).not.toContain('glpat-');
  });

  it('runs backlog.poll, which queues a refresh (trigger poll) through the worker queue', async () => {
    if (!worker) throw new Error('worker not started');
    repo.set(taskPath('backlog', 'BACK-2', 'Second'), taskFile({ id: 'BACK-2', title: 'Second' })).commit();
    const id = await worker.boss.send(BACKLOG_POLL, {});
    if (!id) throw new Error('poll not sent');
    const job = await waitForJob(BACKLOG_POLL, id);

    expect(job.state).toBe('completed');
    expect(job.output).toMatchObject({ enqueued: 1 });
    const refreshes = await worker.boss.findJobs<{ sourceId: string; trigger: string }>(BACKLOG_REFRESH, {
      data: { sourceId, trigger: 'poll' },
    });
    expect(refreshes).toHaveLength(1);
    // It waits for the next 60-second slot; drop it so the next test can queue its own run.
    await worker.boss.deleteJob(BACKLOG_REFRESH, refreshes[0]?.id as string);
  });

  it('ends a refresh paused without the encryption key, instead of failing the job', async () => {
    if (!worker) throw new Error('worker not started');
    const second = await startWorker({
      databaseUrl: database.url,
      logger: createLogger({ write: () => {} }),
      pollingIntervalSeconds: 0.5,
      shutdownTimeoutMs: 2_000,
    });
    await worker.stop();
    worker = second;
    const id = await database.db.transaction((tx) =>
      enqueueBacklogRefresh({ jobs: createJobQueue(second.boss) }, tx, sourceId, 'manual', {
        startAfterSeconds: 1,
      }),
    );
    if (!id) throw new Error('refresh not queued');
    const job = await waitForJob(BACKLOG_REFRESH, id);
    expect(job.state).toBe('completed');
    expect(job.output).toMatchObject({ outcome: 'paused', state: 'paused' });
    expect((job.output as { error: string }).error).toMatch(/APP_ENCRYPTION_KEY/);
  });
});
