// Runs one pg-boss job through core: core parses the payload with its schema and runs the handler.
// The worker only adds logging and hands the result back to pg-boss.
import { type JobName, runJob as runCoreJob } from '@pm/core';
import type { Db } from '@pm/db';
import type { Logger } from './logger';

/** The fields of a pg-boss job the worker uses. */
export interface JobRecord {
  id: string;
  data: unknown;
  retryCount: number;
}

export interface RunJobContext {
  db: Db;
  logger: Logger;
}

/**
 * Runs `job` and returns the handler's result, which pg-boss stores as the job's output.
 * Rethrows handler and payload errors so pg-boss fails the job and retries it up to the queue's limit.
 */
export async function runJob(name: JobName, job: JobRecord, { db, logger }: RunJobContext): Promise<unknown> {
  const jobLogger = logger.child({ job: name, jobId: job.id });
  const started = performance.now();
  const durationMs = () => Math.round(performance.now() - started);
  jobLogger.info('job started', { retryCount: job.retryCount });

  try {
    const output = await runCoreJob({ db }, name, job.data);
    jobLogger.info('job completed', { durationMs: durationMs(), output });
    return output;
  } catch (error) {
    jobLogger.error('job failed', { durationMs: durationMs(), retryCount: job.retryCount, error });
    throw error;
  }
}
