import type { ActiveStatus, Jurisdiction, JurisdictionId } from "@canopytrace/shared";

import { execute, queryOne, queryRows, type Queryable } from "../query.js";

interface JurisdictionRow {
  id: string;
  code: string;
  name: string;
  country_code: string;
  status: string;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

const COLS = "id, code, name, country_code, status, metadata, created_at, updated_at";
const FROM = `SELECT ${COLS} FROM cannabis.jurisdiction`;

function toJurisdiction(row: JurisdictionRow): Jurisdiction {
  return {
    id: row.id as JurisdictionId,
    code: row.code,
    name: row.name,
    countryCode: row.country_code,
    status: row.status as ActiveStatus,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface CreateJurisdictionInput {
  code: string;
  name: string;
  countryCode?: string;
  status?: ActiveStatus;
  metadata?: Record<string, unknown>;
}

export interface UpdateJurisdictionInput {
  name?: string;
  countryCode?: string;
  status?: ActiveStatus;
  metadata?: Record<string, unknown>;
}

export async function findJurisdictionById(
  db: Queryable,
  id: string,
): Promise<Jurisdiction | undefined> {
  const row = await queryOne<JurisdictionRow>(db, `${FROM} WHERE id = $1`, [id]);
  return row !== undefined ? toJurisdiction(row) : undefined;
}

export async function findJurisdictionByCode(
  db: Queryable,
  code: string,
): Promise<Jurisdiction | undefined> {
  const row = await queryOne<JurisdictionRow>(db, `${FROM} WHERE code = $1`, [code]);
  return row !== undefined ? toJurisdiction(row) : undefined;
}

export async function listJurisdictions(db: Queryable): Promise<Jurisdiction[]> {
  const rows = await queryRows<JurisdictionRow>(db, `${FROM} ORDER BY name`);
  return rows.map(toJurisdiction);
}

export async function createJurisdiction(
  db: Queryable,
  input: CreateJurisdictionInput,
): Promise<Jurisdiction> {
  const row = await queryOne<JurisdictionRow>(
    db,
    `INSERT INTO cannabis.jurisdiction (code, name, country_code, status, metadata)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${COLS}`,
    [
      input.code,
      input.name,
      input.countryCode ?? "US",
      input.status ?? "active",
      input.metadata ?? {},
    ],
  );
  if (row === undefined) throw new Error("INSERT returned no row");
  return toJurisdiction(row);
}

export async function updateJurisdiction(
  db: Queryable,
  id: string,
  input: UpdateJurisdictionInput,
): Promise<Jurisdiction | undefined> {
  const sets: Array<[string, unknown]> = [];
  if (input.name !== undefined) sets.push(["name", input.name]);
  if (input.countryCode !== undefined) sets.push(["country_code", input.countryCode]);
  if (input.status !== undefined) sets.push(["status", input.status]);
  if (input.metadata !== undefined) sets.push(["metadata", input.metadata]);

  if (sets.length === 0) return findJurisdictionById(db, id);

  const setClause = sets.map(([col], i) => `${col} = $${i + 1}`).join(", ");
  const values = sets.map(([, v]) => v);

  const row = await queryOne<JurisdictionRow>(
    db,
    `UPDATE cannabis.jurisdiction SET ${setClause}
     WHERE id = $${sets.length + 1}
     RETURNING ${COLS}`,
    [...values, id],
  );
  return row !== undefined ? toJurisdiction(row) : undefined;
}

export async function deleteJurisdiction(db: Queryable, id: string): Promise<boolean> {
  const count = await execute(db, "DELETE FROM cannabis.jurisdiction WHERE id = $1", [
    id,
  ]);
  return count > 0;
}
