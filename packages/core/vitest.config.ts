import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@zamu/core',
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    passWithNoTests: true,
    // Shared migrated database from @zamu/db, exposed as inject('testDatabaseUrl').
    globalSetup: [fileURLToPath(import.meta.resolve('@zamu/db/test/global-setup'))],
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});
