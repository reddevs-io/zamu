import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@zamu/db',
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    passWithNoTests: true,
    // One migrated throwaway database per run, exposed as inject('testDatabaseUrl').
    globalSetup: ['./test/global-setup.ts'],
    hookTimeout: 30_000,
  },
});
