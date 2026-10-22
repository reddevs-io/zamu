import { defineConfig } from 'vitest/config';

// Each app and package has its own vitest.config.ts; `pnpm test` at the root runs them all.
// Run one with `pnpm test --project <name>` or `pnpm --filter <package> test`.
export default defineConfig({
  test: {
    projects: ['apps/*/vitest.config.ts', 'packages/*/vitest.config.ts'],
    passWithNoTests: true,
  },
});
