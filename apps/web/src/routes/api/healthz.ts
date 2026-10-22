import { createDb } from '@pm/db';
import { createFileRoute } from '@tanstack/react-router';

// Liveness and readiness probe used by the Docker HEALTHCHECK, docker compose and CI.
// 200 { status: "ok" } when Postgres answers SELECT 1, 503 { status: "error" } otherwise.

const DB_TIMEOUT_MS = 2_000;

let pool: ReturnType<typeof createDb>['pool'] | undefined;

// A small dedicated pool, so the probe answers quickly when Postgres is down and never waits
// behind application queries.
function getPool() {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    pool = createDb(url, {
      max: 1,
      connectionTimeoutMillis: DB_TIMEOUT_MS,
      query_timeout: DB_TIMEOUT_MS,
    }).pool;
    // An idle connection that breaks (Postgres restart) emits 'error' on the pool; without a listener
    // that would crash the server. The next probe reconnects.
    pool.on('error', (error) => console.error('healthz: idle database connection failed:', error.message));
  }
  return pool;
}

// Connection errors such as ECONNREFUSED arrive as an AggregateError with an empty message.
function describe(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const code = (error as { code?: unknown }).code;
  return error.message || (typeof code === 'string' ? code : error.name);
}

function json(body: { status: 'ok' | 'error' }, status: number) {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}

export const Route = createFileRoute('/api/healthz')({
  server: {
    handlers: {
      GET: async () => {
        try {
          await getPool().query('SELECT 1');
          return json({ status: 'ok' }, 200);
        } catch (error) {
          console.error('healthz: database check failed:', describe(error));
          return json({ status: 'error' }, 503);
        }
      },
    },
  },
});
