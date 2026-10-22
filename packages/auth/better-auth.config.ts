// Config read by the Better Auth CLI only, to regenerate packages/db/src/schema/auth.ts (see the header there).
// The app uses createAuth instead. The mock Drizzle instance never connects.
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { drizzle } from 'drizzle-orm/node-postgres';
import { authOptions } from './src/options';

export const auth = betterAuth({
  ...authOptions({ secret: 'cli-only-secret-cli-only-secret-00', baseUrl: 'http://localhost:3000' }),
  database: drizzleAdapter(drizzle.mock(), { provider: 'pg' }),
});
