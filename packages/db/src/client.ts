import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool, type PoolConfig } from 'pg';
import { relations } from './relations';

export type Relations = typeof relations;

/** The Drizzle database used across the app (node-postgres driver, relations v2). */
export type Db = NodePgDatabase<Relations>;

/** A transaction handle, as passed to the callback of `db.transaction()`. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** Either the database or a transaction, for functions that work in both. */
export type DbOrTx = Db | Tx;

export interface DbHandle {
  db: Db;
  /** The pg Pool behind `db`. Call `pool.end()` on shutdown; pg-boss can share it. */
  pool: Pool;
}

/** Creates a pg Pool for `url` and a Drizzle instance on top of it. */
export function createDb(url: string, poolConfig: Omit<PoolConfig, 'connectionString'> = {}): DbHandle {
  const pool = new Pool({ connectionString: url, ...poolConfig });
  const db = drizzle({ client: pool, relations });
  return { db, pool };
}
