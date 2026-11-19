import { describe, expect, it } from 'vitest';
import { readWorkerConfig, WorkerConfigError, type WorkerEnv } from './config';

const BASE: WorkerEnv = { DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/zamu' };

function problems(env: WorkerEnv): string[] {
  try {
    readWorkerConfig(env);
    return [];
  } catch (error) {
    if (error instanceof WorkerConfigError) return error.problems;
    throw error;
  }
}

describe('readWorkerConfig', () => {
  it('reads a minimal configuration: UTC, no encryption key, public HTTPS hosts only', () => {
    expect(readWorkerConfig(BASE)).toEqual({
      databaseUrl: BASE.DATABASE_URL,
      timeZone: 'UTC',
      encryptionKey: undefined,
      gitHosts: { allowPrivate: false, httpHosts: [] },
    });
  });

  it('reads the encryption key and the git host settings', () => {
    const config = readWorkerConfig({
      ...BASE,
      APP_TIME_ZONE: 'Europe/Paris',
      APP_ENCRYPTION_KEY: Buffer.alloc(32, 3).toString('base64'),
      GIT_ALLOW_PRIVATE_HOSTS: 'true',
      GIT_HTTP_HOSTS: 'localhost:3300',
    });
    expect(config.timeZone).toBe('Europe/Paris');
    expect(config.encryptionKey).toEqual(new Uint8Array(32).fill(3));
    expect(config.gitHosts).toEqual({ allowPrivate: true, httpHosts: ['localhost:3300'] });
  });

  it('lists every problem without echoing the key', () => {
    const key = Buffer.alloc(31, 3).toString('base64');
    const found = problems({
      APP_TIME_ZONE: 'Mars/Olympus',
      APP_ENCRYPTION_KEY: key,
      GIT_ALLOW_PRIVATE_HOSTS: 'maybe',
    });
    expect(found).toEqual([
      'DATABASE_URL is not set',
      'APP_TIME_ZONE is not a valid IANA time zone (got "Mars/Olympus")',
      expect.stringMatching(/^APP_ENCRYPTION_KEY must decode to 32 bytes, not 31/),
      'GIT_ALLOW_PRIVATE_HOSTS must be true or false',
    ]);
    expect(found.join('\n')).not.toContain(key);
  });
});
