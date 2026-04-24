-- Postgres init: runs once when the data volume is first created.
-- Creates extensions and the cannabis schema so they are available before
-- node-pg-migrate runs. The migration baseline (packages/db) handles all DDL.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE SCHEMA IF NOT EXISTS cannabis;
