-- Postgres init: runs once when the data volume is first created.
-- Creates extensions required by the canonical cannabis schema.
-- Migrations (Drizzle/Prisma) handle the actual table DDL.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE SCHEMA IF NOT EXISTS cannabis;
