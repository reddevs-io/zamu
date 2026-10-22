import viteReact from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Tests do not load vite.config.ts (TanStack Start and Nitro plugins are not needed to test modules).
// Two projects: *.test.tsx files run in jsdom with Testing Library, *.test.ts files run in Node.
export default defineConfig({
  plugins: [viteReact()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    name: 'web',
    passWithNoTests: true,
    projects: [
      {
        extends: true,
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: ['src/**/*.test.tsx'],
          setupFiles: ['./vitest.setup.dom.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/**/*.test.ts'],
        },
      },
    ],
  },
});
