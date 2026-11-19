import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@zamu/backlog-md',
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    passWithNoTests: true,
  },
});
