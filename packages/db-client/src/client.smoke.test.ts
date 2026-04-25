import { PostgreSqlContainer } from "@testcontainers/postgresql";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DbError } from "./errors.js";
import { createPool, safeLogUrl } from "./pool.js";
import { queryOne, queryRows, withTransaction } from "./query.js";

describe("db-client smoke tests", () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = createPool({ url: container.getConnectionUri(), poolMin: 1 });
    await queryRows(
      pool,
      `CREATE TABLE items (
        id   SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE
      )`,
    );
  });

  afterAll(async () => {
    await pool.end();
    await container?.stop();
  });

  it("queryRows returns inserted rows", async () => {
    await queryRows(pool, "INSERT INTO items (name) VALUES ($1)", ["alpha"]);
    await queryRows(pool, "INSERT INTO items (name) VALUES ($1)", ["beta"]);
    const rows = await queryRows<{ name: string }>(
      pool,
      "SELECT name FROM items ORDER BY name",
    );
    expect(rows.map((r) => r.name)).toContain("alpha");
    expect(rows.map((r) => r.name)).toContain("beta");
  });

  it("queryOne returns undefined for no match", async () => {
    const row = await queryOne<{ name: string }>(
      pool,
      "SELECT name FROM items WHERE name = $1",
      ["nonexistent"],
    );
    expect(row).toBeUndefined();
  });

  it("queryOne returns the first matching row", async () => {
    const row = await queryOne<{ name: string }>(
      pool,
      "SELECT name FROM items WHERE name = $1",
      ["alpha"],
    );
    expect(row?.name).toBe("alpha");
  });

  it("withTransaction commits on success", async () => {
    await withTransaction(pool, async (client) => {
      await client.query("INSERT INTO items (name) VALUES ($1)", ["gamma"]);
    });
    const row = await queryOne<{ name: string }>(
      pool,
      "SELECT name FROM items WHERE name = $1",
      ["gamma"],
    );
    expect(row?.name).toBe("gamma");
  });

  it("withTransaction rolls back on error and throws DbError", async () => {
    await expect(
      withTransaction(pool, async (client) => {
        await client.query("INSERT INTO items (name) VALUES ($1)", ["delta"]);
        throw new Error("intentional rollback");
      }),
    ).rejects.toBeInstanceOf(DbError);

    const row = await queryOne<{ name: string }>(
      pool,
      "SELECT name FROM items WHERE name = $1",
      ["delta"],
    );
    expect(row).toBeUndefined();
  });

  it("maps unique constraint violation to DbError with code unique_violation", async () => {
    await queryRows(pool, "INSERT INTO items (name) VALUES ($1)", ["unique-test"]);

    let caught: unknown;
    try {
      await queryRows(pool, "INSERT INTO items (name) VALUES ($1)", ["unique-test"]);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(DbError);
    expect((caught as DbError).code).toBe("unique_violation");
    expect((caught as DbError).constraint).toBeDefined();
  });

  it("safeLogUrl redacts the password", () => {
    const redacted = safeLogUrl("postgresql://user:s3cr3t@localhost:5432/mydb");
    expect(redacted).not.toContain("s3cr3t");
    expect(redacted).toContain("***");
    expect(redacted).toContain("localhost");
  });

  it("safeLogUrl is a no-op when there is no password", () => {
    const url = "postgresql://user@localhost:5432/mydb";
    expect(safeLogUrl(url)).toBe(url);
  });

  it("safeLogUrl returns placeholder for an unparseable string", () => {
    expect(safeLogUrl("not-a-url")).toBe("<invalid-url>");
  });
});
