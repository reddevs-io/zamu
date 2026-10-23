import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@pm/git-providers',
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    passWithNoTests: true,
  },
});
