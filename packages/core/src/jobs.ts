// Background jobs: names, payload schemas, schedules and the transactional enqueue helper.
//
// The worker (apps/worker) registers a handler per name in JOB_NAMES, parses payloads with
// parseJobPayload and schedules the entries of JOB_SCHEDULES. Producers call enqueue(boss, tx, ...)
// inside the Drizzle transaction of the write that triggers the job, so the job row only exists if
// that transaction commits.
import type { Tx } from '@pm/db';
import { sql } from 'drizzle-orm';
import { fromDrizzle, type PgBoss, type Db as PgBossDb, type SendOptions } from 'pg-boss';
import { z } from 'zod';

/** Marks expired pending invitations. Payload: `{}` (`now` overrides the clock in tests). */
export const INVITATIONS_EXPIRE = 'invitations.expire';

/** Payload schema per job name. Parse with parseJobPayload in the worker before running a job. */
export const jobPayloadSchemas = {
  [INVITATIONS_EXPIRE]: z.object({
    /** ISO timestamp to treat as "now". Omitted in production: the worker uses the current time. */
    now: z.iso.datetime({ offset: true }).optional(),
  }),
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

/** Recurring jobs. The worker passes each to boss.schedule(name, cron, data, { tz }). */
export const JOB_SCHEDULES: Partial<Record<JobName, JobSchedule>> = {
  // Daily at 03:00 UTC.
  [INVITATIONS_EXPIRE]: { cron: '0 3 * * *', tz: 'UTC', data: {} },
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
  for (const name of JOB_NAMES) await boss.createQueue(name);
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
export type EnqueueOptions = Omit<SendOptions, 'db'>;

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
  const payload = jobPayloadSchemas[name].parse(data);
  return boss.send(name, payload, { ...options, db: transactionDb(tx) });
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
