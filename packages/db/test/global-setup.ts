// Vitest globalSetup: one migrated throwaway database per test run, dropped at the end.
//
// Reuse it from another package's vitest.config.ts:
//   globalSetup: [fileURLToPath(import.meta.resolve('@pm/db/test/global-setup'))]
// then in tests:
//   import { sharedTestDatabaseUrl } from '@pm/db/test';
//   const { db, pool } = createDb(sharedTestDatabaseUrl());
// Tests that need an empty database (first-run checks, for example) call createTestDatabase() instead.
import type { TestProject } from 'vitest/node';
import { createTestDatabase } from './index';

export default async function setup(project: TestProject) {
  const database = await createTestDatabase();
  // Only the URL crosses into the test workers; they open their own pools.
  await database.pool.end();
  project.provide('testDatabaseUrl', database.url);
  return async () => {
    await database.drop();
  };
}
