// The worker's configuration from environment variables, checked as a whole so a misconfigured
// worker exits listing every problem (one fatal log line each). Messages never echo secret values.
import { isValidTimeZone, loadEncryptionKey, loadGitHosts } from '@zamu/core';

export interface WorkerEnv {
  DATABASE_URL?: string | undefined;
  APP_TIME_ZONE?: string | undefined;
  APP_ENCRYPTION_KEY?: string | undefined;
  GIT_ALLOW_PRIVATE_HOSTS?: string | undefined;
  GIT_HTTP_HOSTS?: string | undefined;
}

export interface WorkerConfig {
  databaseUrl: string;
  /** APP_TIME_ZONE, default UTC. */
  timeZone: string;
  /** APP_ENCRYPTION_KEY decoded. Unset: Backlog.md refreshes end paused (the web server says why). */
  encryptionKey: Uint8Array | undefined;
  /** GIT_ALLOW_PRIVATE_HOSTS and GIT_HTTP_HOSTS. */
  gitHosts: { allowPrivate: boolean; httpHosts: string[] };
}

export class WorkerConfigError extends Error {
  constructor(readonly problems: string[]) {
    super(`The worker configuration is invalid: ${problems.join('; ')}`);
    this.name = 'WorkerConfigError';
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function readWorkerConfig(env: WorkerEnv = process.env): WorkerConfig {
  const problems: string[] = [];

  const databaseUrl = env.DATABASE_URL?.trim() ?? '';
  if (!databaseUrl) problems.push('DATABASE_URL is not set');

  const timeZone = env.APP_TIME_ZONE?.trim() || 'UTC';
  if (!isValidTimeZone(timeZone)) {
    problems.push(`APP_TIME_ZONE is not a valid IANA time zone (got "${timeZone}")`);
  }

  let encryptionKey: Uint8Array | undefined;
  try {
    encryptionKey = loadEncryptionKey(env.APP_ENCRYPTION_KEY);
  } catch (error) {
    problems.push(messageOf(error));
  }

  let gitHosts: WorkerConfig['gitHosts'] = { allowPrivate: false, httpHosts: [] };
  try {
    gitHosts = loadGitHosts(env);
  } catch (error) {
    problems.push(messageOf(error));
  }

  if (problems.length > 0) throw new WorkerConfigError(problems);
  return { databaseUrl, timeZone, encryptionKey, gitHosts };
}
