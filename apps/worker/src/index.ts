// Worker entry point: `node --import tsx src/index.ts`. Runs until SIGTERM or SIGINT, then exits 0.
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

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  logger.fatal('DATABASE_URL is not set');
  process.exit(1);
}

// In Docker the worker may start while Postgres is still coming up: retry for about a minute.
const starting: Promise<Worker> = startWorker({ databaseUrl, logger, startAttempts: 6 });

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
