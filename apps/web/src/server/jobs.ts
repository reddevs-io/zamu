// The web server's pg-boss producer: core services that enqueue jobs (Backlog.md setup, Refresh now,
// pm backlog refresh, push webhooks) get it as `ctx.jobs`. It only sends; the worker (apps/worker)
// runs the jobs. pg-boss starts on the first enqueue, so requests that enqueue nothing never open
// its pool. Framework-free: the server context, scripts and tests import it.
import { createJobQueue, ensureQueues, type JobQueue } from '@pm/core';
import { PgBoss } from 'pg-boss';

export interface JobProducer extends JobQueue {
  /** Stops pg-boss if it was started. Idempotent. */
  stop(): Promise<void>;
}

export interface JobProducerOptions {
  /** Logs pg-boss errors (a broken idle connection, for example). Default: console.error. */
  onError?: (error: Error) => void;
}

const APPLICATION_NAME = 'pm-web/pg-boss';

export function createJobProducer(databaseUrl: string, options: JobProducerOptions = {}): JobProducer {
  const onError = options.onError ?? ((error) => console.error('server: pg-boss error:', error.message));
  let boss: PgBoss | undefined;
  let ready: Promise<JobQueue> | undefined;

  const start = (): Promise<JobQueue> => {
    ready ??= (async () => {
      // A producer: no maintenance and no cron in the web process; the worker does both. pg-boss still
      // creates or migrates its schema when the web server enqueues before the worker first started.
      const instance = new PgBoss({
        connectionString: databaseUrl,
        application_name: APPLICATION_NAME,
        instanceName: 'web',
        supervise: false,
        schedule: false,
        max: 2,
      });
      instance.on('error', onError);
      boss = instance;
      await instance.start();
      await ensureQueues(instance);
      return createJobQueue(instance);
    })().catch(async (error: unknown) => {
      // The next enqueue tries again (Postgres restarting, for example).
      const failed = boss;
      boss = undefined;
      ready = undefined;
      await failed?.stop({ graceful: false }).catch(() => {});
      throw error;
    });
    return ready;
  };

  return {
    async enqueue(tx, name, data, sendOptions) {
      const queue = await start();
      return queue.enqueue(tx, name, data, sendOptions);
    },
    async stop() {
      const started = ready;
      if (!started) return;
      ready = undefined;
      await started.catch(() => {});
      const instance = boss;
      boss = undefined;
      await instance?.stop({ graceful: true, timeout: 2_000 });
    },
  };
}
