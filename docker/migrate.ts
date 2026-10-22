// Entry point of the image's `migrate` role: applies pending Drizzle migrations to DATABASE_URL and exits.
// The Dockerfile copies this file next to the deployed worker so `@pm/db` resolves from its node_modules.
import { migrate } from '@pm/db';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('migrate: DATABASE_URL is not set');
  process.exit(1);
}

try {
  await migrate(url);
  console.log('migrate: database is up to date');
} catch (error) {
  console.error('migrate: failed', error);
  process.exit(1);
}
