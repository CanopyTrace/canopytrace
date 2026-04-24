"use strict";
// Local-dev reset: drops the cannabis schema and migration history, then re-applies
// all migrations from scratch. DESTRUCTIVE — never run against production.
const path = require("node:path");
const fs = require("node:fs");
const { spawnSync } = require("node:child_process");

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

async function reset() {
  process.stdout.write(
    "⚠️  Dropping cannabis schema and migration history…\n",
  );
  const client = new Client({ connectionString: process.env["DATABASE_URL"] });
  await client.connect();
  try {
    await client.query("DROP SCHEMA IF EXISTS cannabis CASCADE");
    await client.query("DROP TABLE IF EXISTS public.schema_migrations");
    process.stdout.write("Dropped.\n");
  } finally {
    await client.end();
  }

  process.stdout.write("Re-applying all migrations…\n");
  const result = spawnSync(
    process.execPath,
    [path.resolve(__dirname, "run.js"), "up"],
    { stdio: "inherit", env: process.env },
  );
  process.exit(result.status ?? 0);
}

reset().catch((err) => {
  process.stderr.write(`${err.message}\n`);
  process.exit(1);
});
