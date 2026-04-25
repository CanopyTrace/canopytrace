"use strict";
const path = require("node:path");
const fs = require("node:fs");

function loadEnv() {
  if (process.env["DATABASE_URL"]) return;
  const infraEnv = path.resolve(__dirname, "../../../infra/.env");
  if (fs.existsSync(infraEnv)) {
    require("dotenv").config({ path: infraEnv });
  }
  if (!process.env["DATABASE_URL"]) {
    const { POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB } = process.env;
    if (POSTGRES_USER && POSTGRES_PASSWORD && POSTGRES_DB) {
      process.env["DATABASE_URL"] =
        `postgresql://${POSTGRES_USER}:${encodeURIComponent(POSTGRES_PASSWORD)}@localhost:5432/${POSTGRES_DB}`;
    }
  }
}

loadEnv();

if (!process.env["DATABASE_URL"]) {
  process.stderr.write("Error: DATABASE_URL is not set.\n");
  process.exit(1);
}

const { Client } = require("pg");
const migrationsDir = path.resolve(__dirname, "../migrations");

async function status() {
  const client = new Client({ connectionString: process.env["DATABASE_URL"] });
  await client.connect();

  let applied = new Set();
  try {
    const res = await client.query(
      "SELECT name FROM public.schema_migrations ORDER BY run_on",
    );
    applied = new Set(res.rows.map((r) => r["name"]));
  } catch {
    // Table may not exist yet (no migrations run).
  } finally {
    await client.end();
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => /\.(sql|js|ts)$/.test(f))
    .sort();

  if (files.length === 0) {
    process.stdout.write("No migration files found.\n");
    return;
  }

  process.stdout.write("\nMigration status\n");
  process.stdout.write("─".repeat(60) + "\n");

  for (const file of files) {
    const name = file.replace(/\.(sql|js|ts)$/, "");
    const state = applied.has(name) ? "✓ applied " : "○ pending ";
    process.stdout.write(`  ${state}  ${file}\n`);
  }

  process.stdout.write("─".repeat(60) + "\n");
  const pending = files.filter(
    (f) => !applied.has(f.replace(/\.(sql|js|ts)$/, "")),
  ).length;
  process.stdout.write(`  ${applied.size} applied, ${pending} pending\n\n`);
}

status().catch((err) => {
  process.stderr.write(`${err.message}\n`);
  process.exit(1);
});
