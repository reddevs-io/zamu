import pg from 'pg';

/** Returns `url` with its database name replaced by `database`. */
export function withDatabase(url: string, database: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${encodeURIComponent(database)}`;
  return parsed.toString();
}

/** Database name in a connection URL. */
export function databaseName(url: string): string {
  const name = decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
  if (!name) throw new Error('The database URL has no database name');
  return name;
}

/** Runs `fn` with a client connected to the server's "postgres" maintenance database. */
async function withMaintenanceClient<T>(url: string, fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: withDatabase(url, 'postgres') });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/** Creates the database named in `url`. */
export async function createDatabase(url: string): Promise<void> {
  const name = databaseName(url);
  await withMaintenanceClient(url, (client) =>
    client.query(`CREATE DATABASE ${client.escapeIdentifier(name)}`),
  );
}

/** Drops the database named in `url` if it exists, closing other connections to it first. */
export async function dropDatabase(url: string): Promise<void> {
  const name = databaseName(url);
  await withMaintenanceClient(url, (client) =>
    client.query(`DROP DATABASE IF EXISTS ${client.escapeIdentifier(name)} WITH (FORCE)`),
  );
}
