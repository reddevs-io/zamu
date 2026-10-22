import { defineConfig } from 'drizzle-kit';

// `pnpm --filter @pm/db generate` diffs src/schema against migrations/ and writes a new migration.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/project_management',
  },
});
