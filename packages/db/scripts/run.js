"use strict";
const path = require("node:path");
const fs = require("node:fs");
const { spawnSync } = require("node:child_process");

// ---------------------------------------------------------------------------
// Resolve DATABASE_URL
// ---------------------------------------------------------------------------
function loadEnv() {
  // 1. Already in environment — nothing to do.
  if (process.env["DATABASE_URL"]) return;

  // 2. Try infra/.env via dotenv (contains POSTGRES_* vars and optionally DATABASE_URL).
  const infraEnv = path.resolve(__dirname, "../../../infra/.env");
  if (fs.existsSync(infraEnv)) {
    require("dotenv").config({ path: infraEnv });
  }

  // 3. Construct from individual POSTGRES_* vars (docker-compose convention).
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
  process.stderr.write(
    "Error: DATABASE_URL is not set and cannot be derived from POSTGRES_* vars.\n" +
      "Copy infra/.env.example to infra/.env and fill in the values.\n",
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Resolve node-pg-migrate CLI entry point (cross-platform, no shell needed)
// ---------------------------------------------------------------------------
const pgMigrateRoot = path.dirname(require.resolve("node-pg-migrate/package.json"));
const pkgJson = JSON.parse(
  fs.readFileSync(path.join(pgMigrateRoot, "package.json"), "utf8"),
);
const binField = pkgJson["bin"];
const binRelPath = typeof binField === "string" ? binField : binField["node-pg-migrate"];
const binPath = path.resolve(pgMigrateRoot, binRelPath);

// ---------------------------------------------------------------------------
// Forward to node-pg-migrate
// ---------------------------------------------------------------------------
const [direction, ...rest] = process.argv.slice(2);

if (!direction) {
  process.stderr.write("Usage: node scripts/run.js <up|down|status|create> [args]\n");
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  [
    binPath,
    "--migrations-dir",
    path.resolve(__dirname, "../migrations"),
    "--migrations-table",
    "schema_migrations",
    direction,
    ...rest,
  ],
  { stdio: "inherit", env: process.env },
);

process.exit(result.status ?? 0);
