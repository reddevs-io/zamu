import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@pm/auth',
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    passWithNoTests: true,
    // Shared migrated database from @pm/db, exposed as inject('testDatabaseUrl').
    globalSetup: [fileURLToPath(import.meta.resolve('@pm/db/test/global-setup'))],
    hookTimeout: 30_000,
  },
});
