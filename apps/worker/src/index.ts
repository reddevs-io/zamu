// Worker entry point: `node --import tsx src/index.ts`. Runs until SIGTERM or SIGINT, then exits 0.
import { readWorkerConfig, WorkerConfigError } from './config';
import { createLogger, isLogLevel } from './logger';
import { startWorker, type Worker } from './worker';

const level = process.env.LOG_LEVEL;
const logger = createLogger({
  level: isLogLevel(level) ? level : 'info',
  base: { service: 'worker' },
});

process.on('uncaughtException', (error) => {
  logger.fatal('uncaught exception', { error });
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  logger.fatal('unhandled rejection', { error: reason });
  process.exit(1);
});

let config: ReturnType<typeof readWorkerConfig>;
try {
  config = readWorkerConfig(process.env);
} catch (error) {
  if (!(error instanceof WorkerConfigError)) throw error;
  for (const problem of error.problems) logger.fatal(problem);
  process.exit(1);
}
const { databaseUrl, timeZone, encryptionKey, gitHosts } = config;
if (!encryptionKey) {
  logger.warn('APP_ENCRYPTION_KEY is not set: Backlog.md refreshes end paused until it is');
}

// In Docker the worker may start while Postgres is still coming up: retry for about a minute.
const starting: Promise<Worker> = startWorker({
  databaseUrl,
  logger,
  startAttempts: 6,
  timeZone,
  git: { ...(encryptionKey ? { encryptionKey } : {}), gitHosts },
});

let shuttingDown = false;
const shutdown = (signal: NodeJS.Signals) => {
  if (shuttingDown) {
    logger.info('shutdown already in progress', { signal });
    return;
  }
  shuttingDown = true;
  logger.info('shutting down', { signal });
  starting
    .then((worker) => worker.stop())
    .then(
      () => process.exit(0),
      (error: unknown) => {
        logger.error('shutdown failed', { error });
        process.exit(1);
      },
    );
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

starting.catch((error: unknown) => {
  logger.fatal('worker failed to start', { error });
  process.exit(1);
});
