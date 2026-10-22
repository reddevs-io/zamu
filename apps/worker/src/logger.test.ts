import { describe, expect, it } from 'vitest';
import { createLogger } from './logger';

const fixedNow = () => new Date('2026-10-22T03:00:00.000Z');

function capture(options: Parameters<typeof createLogger>[0] = {}) {
  const lines: string[] = [];
  const logger = createLogger({ now: fixedNow, write: (line) => lines.push(line), ...options });
  return { logger, lines };
}

describe('createLogger', () => {
  it('writes one JSON object per line with time, level, message and fields', () => {
    const { logger, lines } = capture({ base: { service: 'worker' } });

    logger.info('worker ready', { jobs: ['invitations.expire'] });

    expect(lines).toHaveLength(1);
    expect(lines[0]).not.toContain('\n');
    expect(JSON.parse(lines[0] ?? '')).toEqual({
      time: '2026-10-22T03:00:00.000Z',
      level: 'info',
      msg: 'worker ready',
      service: 'worker',
      jobs: ['invitations.expire'],
    });
  });

  it('serializes errors with their cause and code', () => {
    const { logger, lines } = capture();
    const cause = Object.assign(new Error('connection refused'), { code: 'ECONNREFUSED' });

    logger.error('job failed', { error: new Error('could not expire invitations', { cause }) });

    const entry = JSON.parse(lines[0] ?? '');
    expect(entry.error).toMatchObject({
      name: 'Error',
      message: 'could not expire invitations',
      stack: expect.stringContaining('could not expire invitations'),
      cause: { message: 'connection refused', code: 'ECONNREFUSED' },
    });
  });

  it('drops lines below the level and keeps bound fields on child loggers', () => {
    const { logger, lines } = capture({ level: 'warn', base: { service: 'worker' } });
    const child = logger.child({ job: 'invitations.expire', jobId: 'j1' });

    child.info('job started');
    child.warn('slow job', { durationMs: 1200 });

    expect(lines.map((line) => JSON.parse(line))).toEqual([
      expect.objectContaining({
        level: 'warn',
        msg: 'slow job',
        service: 'worker',
        job: 'invitations.expire',
        jobId: 'j1',
        durationMs: 1200,
      }),
    ]);
  });

  it('still writes a line when the fields are circular', () => {
    const { logger, lines } = capture();
    const loop: Record<string, unknown> = {};
    loop.self = loop;

    logger.info('odd fields', { loop });

    expect(JSON.parse(lines[0] ?? '')).toMatchObject({ msg: 'odd fields', logError: expect.any(Object) });
  });
});
