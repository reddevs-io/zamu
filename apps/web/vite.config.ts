import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { nitro } from 'nitro/vite';
import { defineConfig } from 'vite';

// Server code reads DATABASE_URL, BETTER_AUTH_* and PUBLIC_URL from process.env. In development they come
// from the repository's root .env; variables already set in the environment win.
const rootEnv = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

export default defineConfig({
  server: {
    port: Number(process.env.PORT ?? 3000),
  },
  resolve: {
    // `~/*` maps to `src/*` (see tsconfig.json).
    tsconfigPaths: true,
  },
  // Order matters: Tailwind, TanStack Start, Nitro, then React (React must come after Start).
  plugins: [
    tailwindcss(),
    tanstackStart(),
    nitro({
      // Self-hosted Node server: .output/server/index.mjs, started with `pnpm --filter web start`.
      preset: 'node-server',
      compatibilityDate: '2026-10-22',
      // React's "use client" directives are irrelevant in the server bundle; silence the warnings.
      rolldownConfig: { checks: { moduleLevelDirective: false } },
      // Refuse to start on an invalid auth or server config (Nitro v3 lists plugins explicitly).
      plugins: ['./src/server/plugins/config-check.ts'],
    }),
    viteReact(),
  ],
});
