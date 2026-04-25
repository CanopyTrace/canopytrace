import type { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";

import { mapDbError } from "./errors.js";

// Accepted by all query helpers — pass a Pool for standalone calls or a
// PoolClient when composing inside withTransaction.
export type Queryable = Pool | PoolClient;

export async function query<R extends QueryResultRow = QueryResultRow>(
  db: Queryable,
  sql: string,
  params: readonly unknown[] = [],
): Promise<QueryResult<R>> {
  try {
    return await (db as Pool).query<R>(sql, params as unknown[]);
  } catch (err) {
    throw mapDbError(err);
  }
}

export async function queryRows<R extends QueryResultRow = QueryResultRow>(
  db: Queryable,
  sql: string,
  params: readonly unknown[] = [],
): Promise<R[]> {
  const result = await query<R>(db, sql, params);
  return result.rows;
}

export async function queryOne<R extends QueryResultRow = QueryResultRow>(
  db: Queryable,
  sql: string,
  params: readonly unknown[] = [],
): Promise<R | undefined> {
  const rows = await queryRows<R>(db, sql, params);
  return rows[0];
}

export async function execute(
  db: Queryable,
  sql: string,
  params: readonly unknown[] = [],
): Promise<number> {
  const result = await query(db, sql, params);
  return result.rowCount ?? 0;
}

export async function withTransaction<T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw mapDbError(err);
  } finally {
    client.release();
  }
}
