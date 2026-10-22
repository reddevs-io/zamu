// Runs the real entry point the way `pnpm --filter worker start` and the Docker image do
// (`node --import tsx src/index.ts`) and checks it stops with exit code 0 on SIGTERM and SIGINT.
import { type ChildProcess, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { sharedTestDatabaseUrl } from '@pm/db/test';
import { afterEach, describe, expect, it } from 'vitest';

const workerDir = fileURLToPath(new URL('..', import.meta.url));
let child: ChildProcess | undefined;

afterEach(() => {
  if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  child = undefined;
});

interface Run {
  lines: () => Record<string, unknown>[];
  ready: Promise<void>;
  exit: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
}

function runWorker(env: Record<string, string | undefined>): Run {
  const spawned = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
    cwd: workerDir,
    env: { ...process.env, LOG_LEVEL: 'info', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child = spawned;

  let stdout = '';
  let stderr = '';
  const parsed: Record<string, unknown>[] = [];
  let onReady: () => void = () => {};
  const ready = new Promise<void>((resolve) => {
    onReady = resolve;
  });

  spawned.stdout.setEncoding('utf8').on('data', (chunk: string) => {
    stdout += chunk;
    let newline = stdout.indexOf('\n');
    while (newline !== -1) {
      const line = stdout.slice(0, newline);
      stdout = stdout.slice(newline + 1);
      // Every stdout line must be one JSON object: JSON.parse throws (and fails the test) otherwise.
      const entry = JSON.parse(line) as Record<string, unknown>;
      parsed.push(entry);
      if (entry.msg === 'worker ready') onReady();
      newline = stdout.indexOf('\n');
    }
  });
  spawned.stderr.setEncoding('utf8').on('data', (chunk: string) => {
    stderr += chunk;
  });

  const exit = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    // 'close' rather than 'exit': it fires after stdout and stderr are drained.
    spawned.on('close', (code, signal) => resolve({ code, signal }));
  });
  // Surface the output when the process dies before it is ready.
  void exit.then(({ code }) => {
    if (!parsed.some((entry) => entry.msg === 'worker ready')) {
      console.error(`worker exited early with ${code}\nstdout: ${stdout}\nstderr: ${stderr}`);
    }
  });

  return { lines: () => parsed, ready, exit };
}

describe('worker process', () => {
  it.each(['SIGTERM', 'SIGINT'] as const)(
    'runs until %s, then stops cleanly with exit code 0',
    async (signal) => {
      const run = runWorker({ DATABASE_URL: sharedTestDatabaseUrl() });

      await Promise.race([
        run.ready,
        run.exit.then(({ code }) => {
          throw new Error(`worker exited with ${code} before it was ready`);
        }),
      ]);
      child?.kill(signal);

      await expect(run.exit).resolves.toEqual({ code: 0, signal: null });
      const messages = run.lines().map((entry) => entry.msg);
      expect(messages).toEqual(expect.arrayContaining(['worker ready', 'shutting down', 'worker stopped']));
      expect(messages.indexOf('worker stopped')).toBeGreaterThan(messages.indexOf('shutting down'));
      for (const entry of run.lines()) {
        expect(entry).toMatchObject({
          service: 'worker',
          level: expect.any(String),
          time: expect.any(String),
        });
      }
    },
  );

  it('exits 1 with a fatal log line when DATABASE_URL is missing', async () => {
    const run = runWorker({ DATABASE_URL: '' });

    await expect(run.exit).resolves.toEqual({ code: 1, signal: null });
    expect(run.lines()).toContainEqual(
      expect.objectContaining({ level: 'fatal', msg: 'DATABASE_URL is not set' }),
    );
  });
});
