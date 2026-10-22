// pnpm --filter @pm/db migrate: applies pending migrations to DATABASE_URL.
import { migrate } from '../src/migrate';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

await migrate(url);
console.log('migrations applied');
