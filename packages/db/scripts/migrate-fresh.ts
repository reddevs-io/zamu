// pnpm --filter @zamu/db migrate:fresh: drops the database named in DATABASE_URL, re-creates it and migrates it.
// Destroys every row in that database. Refuses to run when NODE_ENV=production.
import { createDatabase, databaseName, dropDatabase } from '../src/admin';
import { migrate } from '../src/migrate';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}
if (process.env.NODE_ENV === 'production') {
  console.error('migrate:fresh drops the database and does not run with NODE_ENV=production');
  process.exit(1);
}

const name = databaseName(url);
if (name === 'postgres') {
  console.error('migrate:fresh does not drop the "postgres" maintenance database');
  process.exit(1);
}

await dropDatabase(url);
await createDatabase(url);
await migrate(url);
console.log(`database "${name}" re-created and migrated`);
