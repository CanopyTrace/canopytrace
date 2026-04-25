import type { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";

import { mapDbError } from "./errors.js";

export async function query<R extends QueryResultRow = QueryResultRow>(
  pool: Pool,
  sql: string,
  params: readonly unknown[] = [],
): Promise<QueryResult<R>> {
  try {
    return await pool.query<R>(sql, params as unknown[]);
  } catch (err) {
    throw mapDbError(err);
  }
}

export async function queryRows<R extends QueryResultRow = QueryResultRow>(
  pool: Pool,
  sql: string,
  params: readonly unknown[] = [],
): Promise<R[]> {
  const result = await query<R>(pool, sql, params);
  return result.rows;
}

export async function queryOne<R extends QueryResultRow = QueryResultRow>(
  pool: Pool,
  sql: string,
  params: readonly unknown[] = [],
): Promise<R | undefined> {
  const rows = await queryRows<R>(pool, sql, params);
  return rows[0];
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
