// Background jobs: names, payload schemas, schedules and the transactional enqueue helper.
//
// The worker (apps/worker) registers a handler per name in JOB_NAMES, parses payloads with
// parseJobPayload and schedules the entries of JOB_SCHEDULES. Producers call enqueue(boss, tx, ...)
// inside the Drizzle transaction of the write that triggers the job, so the job row only exists if
// that transaction commits.
import { BacklogTrigger } from '@pm/contracts';
import type { Tx } from '@pm/db';
import { sql } from 'drizzle-orm';
import { fromDrizzle, type PgBoss, type Db as PgBossDb, type Queue, type SendOptions } from 'pg-boss';
import { z } from 'zod';

/** Marks expired pending invitations. Payload: `{}` (`now` overrides the clock in tests). */
export const INVITATIONS_EXPIRE = 'invitations.expire';

/**
 * Ends every cycle whose end date is before today in APP_TIME_ZONE, moving unfinished tasks on.
 * Payload: `{}` (`now` overrides the clock in tests).
 */
export const CYCLES_END_DUE = 'cycles.end-due';

/**
 * Reads one Backlog.md source and applies the difference (M3). Payload: `{ sourceId, trigger }`.
 * Enqueue with enqueueBacklogRefresh (backlog/refresh.ts): one queued run per source, bursts within
 * 60 seconds collapse into one run.
 */
export const BACKLOG_REFRESH = 'backlog.refresh';

/**
 * Hourly: enqueues a refresh (trigger poll) for every mirror that is not detached; each run stops
 * early when the default branch head has not moved. Payload: `{}` (`now` overrides the clock).
 */
export const BACKLOG_POLL = 'backlog.poll';

/** Payload of jobs that only take an optional clock override. */
const ClockPayload = z.object({
  /** ISO timestamp to treat as "now". Omitted in production: the worker uses the current time. */
  now: z.iso.datetime({ offset: true }).optional(),
});

/** Payload schema per job name. Parse with parseJobPayload in the worker before running a job. */
export const jobPayloadSchemas = {
  [INVITATIONS_EXPIRE]: ClockPayload,
  [CYCLES_END_DUE]: ClockPayload,
  [BACKLOG_REFRESH]: z.object({ sourceId: z.uuid(), trigger: BacklogTrigger }),
  [BACKLOG_POLL]: ClockPayload,
} as const;

export type JobName = keyof typeof jobPayloadSchemas;

/** Every job name, for createQueue and work registration. */
export const JOB_NAMES = Object.keys(jobPayloadSchemas) as JobName[];

/** Payload as producers send it. */
export type JobPayloadInput<N extends JobName> = z.input<(typeof jobPayloadSchemas)[N]>;
/** Payload after parsing, as handlers receive it. */
export type JobPayload<N extends JobName> = z.output<(typeof jobPayloadSchemas)[N]>;

export interface JobSchedule {
  /** Cron expression evaluated in `tz`. */
  cron: string;
  tz: string;
  /** Payload sent with each scheduled job. */
  data: Record<string, unknown>;
}

/** Minute past each hour of the backlog.poll schedule (status pages show the next poll). */
export const BACKLOG_POLL_CRON_MINUTE = 15;

/** Recurring jobs. The worker passes each to boss.schedule(name, cron, data, { tz }). */
export const JOB_SCHEDULES: Partial<Record<JobName, JobSchedule>> = {
  // Daily at 03:00 UTC.
  [INVITATIONS_EXPIRE]: { cron: '0 3 * * *', tz: 'UTC', data: {} },
  // Hourly, on the hour. "Today" comes from APP_TIME_ZONE in the handler's context, so a cycle ends
  // within the hour after midnight there (zones with a half-hour offset: within 30 minutes later).
  [CYCLES_END_DUE]: { cron: '0 * * * *', tz: 'UTC', data: {} },
  // Hourly at :15, away from the cycle job on the hour.
  [BACKLOG_POLL]: { cron: `${BACKLOG_POLL_CRON_MINUTE} * * * *`, tz: 'UTC', data: {} },
};

/**
 * Queue options per job name, passed to createQueue. backlog.refresh is `stately`: per source
 * (singletonKey) at most one queued and one running job.
 */
export const JOB_QUEUE_OPTIONS: Partial<Record<JobName, Omit<Queue, 'name'>>> = {
  [BACKLOG_REFRESH]: { policy: 'stately' },
};

export function isJobName(name: string): name is JobName {
  return Object.hasOwn(jobPayloadSchemas, name);
}

/** Validates a job payload. Throws a ZodError for malformed data, which fails the job. */
export function parseJobPayload<N extends JobName>(name: N, data: unknown): JobPayload<N> {
  return jobPayloadSchemas[name].parse(data ?? {}) as JobPayload<N>;
}

/** Creates every queue in JOB_NAMES. Idempotent; call after boss.start() in the worker and producers. */
export async function ensureQueues(boss: PgBoss): Promise<void> {
  for (const name of JOB_NAMES) await boss.createQueue(name, JOB_QUEUE_OPTIONS[name]);
}

/**
 * A pg-boss database adapter that runs pg-boss's SQL on a Drizzle transaction's connection
 * (pg-boss's own fromDrizzle adapter). Passed as `options.db` to boss.send, so the job insert
 * joins the caller's transaction.
 */
export function transactionDb(tx: Tx): PgBossDb {
  return fromDrizzle(tx, sql);
}

/** Send options accepted by enqueue. `db` is always the transaction's connection. */
export type EnqueueOptions = Omit<SendOptions, 'db'> & {
  /**
   * With `singletonKey`: when a queued job with the same key suppresses this send while it waits
   * for a later debounce slot (sent with singletonSeconds and singletonNextSlot), cancel that job
   * and send this one in its place, so it starts now. Jobs deferred by `startAfter` alone (retries
   * after a rate limit) and jobs about to start are left alone.
   */
  replaceDebounced?: boolean;
};

/** A waiting debounced job that starts within this many milliseconds is left to start on its own. */
const REPLACE_MARGIN_MS = 2_000;

/**
 * Sends a job through pg-boss using the transaction's connection: if the transaction rolls back,
 * the job is gone too. `boss` must be started and its queues created (ensureQueues).
 * Returns the job id, or null when a singleton or throttle option suppressed the job.
 */
export async function enqueue<N extends JobName>(
  boss: PgBoss,
  tx: Tx,
  name: N,
  data: JobPayloadInput<N>,
  options: EnqueueOptions = {},
): Promise<string | null> {
  const { replaceDebounced, ...send } = options;
  const payload = jobPayloadSchemas[name].parse(data);
  const db = transactionDb(tx);
  const id = await boss.send(name, payload, { ...send, db });
  if (id !== null || !replaceDebounced || !send.singletonKey) return id;
  // pg-boss's update() could move the waiting job's start, but it keeps the job's debounce slot:
  // a trigger during that run would then find both slots taken and queue nothing. Cancelling frees
  // the slot. Both statements run in `tx`, so a rollback restores the waiting job.
  // Through the Drizzle adapter, timestamps come back as Postgres text, not Date (despite the types).
  const startsBy = Date.now() + REPLACE_MARGIN_MS;
  const waiting = (await boss.findJobs(name, { key: send.singletonKey, queued: true, db })).filter(
    (job) =>
      job.state === 'created' &&
      job.singletonOn !== null &&
      new Date(job.startAfter as Date | string).getTime() > startsBy,
  );
  if (waiting.length === 0) return null;
  await boss.cancel(
    name,
    waiting.map((job) => job.id),
    { db },
  );
  return boss.send(name, payload, { ...send, db });
}

/** A producer bound to one pg-boss instance, as held by the core context. */
export interface JobQueue {
  enqueue<N extends JobName>(
    tx: Tx,
    name: N,
    data: JobPayloadInput<N>,
    options?: EnqueueOptions,
  ): Promise<string | null>;
}

export function createJobQueue(boss: PgBoss): JobQueue {
  return {
    enqueue: (tx, name, data, options) => enqueue(boss, tx, name, data, options),
  };
}
