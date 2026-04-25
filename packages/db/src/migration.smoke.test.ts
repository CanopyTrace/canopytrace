import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Client } from "pg";
import { runner } from "node-pg-migrate";

// pnpm always cds to the package root before running scripts
const MIGRATIONS_DIR = path.join(process.cwd(), "migrations");

// Representative sample: one table from each schema section
const REPRESENTATIVE_TABLES = [
  "tenant",
  "facility",
  "license",
  "strain",
  "plant",
  "material_lot",
  "package",
  "sale",
  "transfer",
  "outbox_event",
  "regulatory_sync_job",
  "audit_event",
] as const;

describe("baseline migration smoke tests", () => {
  let container: StartedPostgreSqlContainer;
  let client: Client;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    client = new Client({ connectionString: container.getConnectionUri() });
    await client.connect();
    await runner({
      databaseUrl: container.getConnectionUri(),
      dir: MIGRATIONS_DIR,
      migrationsTable: "schema_migrations",
      direction: "up",
      count: Infinity,
      log: () => {},
    });
  });

  afterAll(async () => {
    await client?.end();
    await container?.stop();
  });

  it("records the migration in schema_migrations", async () => {
    const { rows } = await client.query<{ name: string }>(
      "SELECT name FROM public.schema_migrations ORDER BY run_on",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toMatch(/baseline/);
  });

  it.each(REPRESENTATIVE_TABLES)("cannabis.%s exists", async (table) => {
    const { rowCount } = await client.query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'cannabis' AND table_name = $1`,
      [table],
    );
    expect(rowCount).toBe(1);
  });

  it("updated_at trigger fires on cannabis.tenant", async () => {
    // Insert with an artificially old updated_at — this removes any timing dependency.
    const ancientDate = new Date("2000-01-01T00:00:00Z");
    await client.query(
      "INSERT INTO cannabis.tenant (name, updated_at) VALUES ('smoke-trigger', $1)",
      [ancientDate],
    );
    await client.query(
      "UPDATE cannabis.tenant SET name = 'smoke-trigger-done' WHERE name = 'smoke-trigger'",
    );
    const { rows } = await client.query<{ updated_at: Date }>(
      "SELECT updated_at FROM cannabis.tenant WHERE name = 'smoke-trigger-done'",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.updated_at.getTime()).toBeGreaterThan(ancientDate.getTime());
  });
});
