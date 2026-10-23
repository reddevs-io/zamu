import { defineConfig } from 'vitest/config';

// Integration tests against a real Forgejo container (docker/forgejo). Run with
// `pnpm --filter @pm/git-providers test:integration`. Without Docker they are skipped with a message.
export default defineConfig({
  test: {
    name: '@pm/git-providers:integration',
    environment: 'node',
    include: ['test/integration/**/*.integration.ts'],
    globalSetup: ['test/integration/global-setup.ts'],
    testTimeout: 60_000,
    hookTimeout: 300_000,
  },
});
