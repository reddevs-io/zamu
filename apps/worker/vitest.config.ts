import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'worker',
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    passWithNoTests: true,
    // One migrated throwaway database per run, read with sharedTestDatabaseUrl().
    globalSetup: [fileURLToPath(import.meta.resolve('@pm/db/test/global-setup'))],
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});
