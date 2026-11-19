// Test helpers for packages that need a real Postgres database. Never mock the database.
import { randomBytes } from 'node:crypto';
import type { Pool } from 'pg';
import { inject } from 'vitest';
import { createDatabase, dropDatabase, withDatabase } from '../src/admin';
import { createDb, type Db } from '../src/client';
import { migrate } from '../src/migrate';

declare module 'vitest' {
  export interface ProvidedContext {
    /** URL of the migrated database that test/global-setup.ts creates for the test run. */
    testDatabaseUrl: string;
  }
}

/** URL of the shared database from test/global-setup.ts. Only valid inside Vitest with that globalSetup. */
export function sharedTestDatabaseUrl(): string {
  return inject('testDatabaseUrl');
}

/** Server used to create throwaway databases. */
export const DEFAULT_TEST_DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/postgres';

export function testServerUrl(): string {
  return process.env.TEST_DATABASE_URL || DEFAULT_TEST_DATABASE_URL;
}

export interface TestDatabase {
  db: Db;
  pool: Pool;
  /** Connection URL of the throwaway database. */
  url: string;
  /** Closes the pool and drops the database. Safe to call twice. */
  drop: () => Promise<void>;
}

/** A unique database name, prefixed so leftovers are easy to spot and clean up. */
export function uniqueDatabaseName(prefix = 'pm_test'): string {
  return `${prefix}_${Date.now().toString(36)}_${randomBytes(4).toString('hex')}`;
}

/**
 * Creates a uniquely named database on the server from TEST_DATABASE_URL, applies every migration
 * and returns a Drizzle instance on it. Call `drop()` in afterAll.
 */
export async function createTestDatabase(
  options: { serverUrl?: string; prefix?: string } = {},
): Promise<TestDatabase> {
  const url = withDatabase(options.serverUrl ?? testServerUrl(), uniqueDatabaseName(options.prefix));
  await createDatabase(url);
  try {
    await migrate(url);
  } catch (error) {
    await dropDatabase(url);
    throw error;
  }
  const { db, pool } = createDb(url);
  // DROP DATABASE ... WITH (FORCE) terminates any connection still open (57P01). Without a listener,
  // an idle client's error becomes an uncaught exception that fails the whole run (as fixtures.ts guards).
  pool.on('error', () => {});
  let dropped = false;
  return {
    db,
    pool,
    url,
    drop: async () => {
      if (dropped) return;
      dropped = true;
      if (!pool.ended) await pool.end();
      await dropDatabase(url);
    },
  };
}
