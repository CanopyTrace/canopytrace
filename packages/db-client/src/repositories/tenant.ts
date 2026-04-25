import type { ActiveStatus, DeploymentMode, Tenant, TenantId } from "@canopytrace/shared";

import { execute, queryOne, queryRows, type Queryable } from "../query.js";

interface TenantRow {
  id: string;
  name: string;
  deployment_mode: string;
  status: string;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

const COLS = "id, name, deployment_mode, status, metadata, created_at, updated_at";
const FROM = `SELECT ${COLS} FROM cannabis.tenant`;

function toTenant(row: TenantRow): Tenant {
  return {
    id: row.id as TenantId,
    name: row.name,
    deploymentMode: row.deployment_mode as DeploymentMode,
    status: row.status as ActiveStatus,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface CreateTenantInput {
  name: string;
  deploymentMode?: DeploymentMode;
  status?: ActiveStatus;
  metadata?: Record<string, unknown>;
}

export interface UpdateTenantInput {
  name?: string;
  deploymentMode?: DeploymentMode;
  status?: ActiveStatus;
  metadata?: Record<string, unknown>;
}

export async function findTenantById(
  db: Queryable,
  id: string,
): Promise<Tenant | undefined> {
  const row = await queryOne<TenantRow>(db, `${FROM} WHERE id = $1`, [id]);
  return row !== undefined ? toTenant(row) : undefined;
}

export async function listTenants(db: Queryable): Promise<Tenant[]> {
  const rows = await queryRows<TenantRow>(db, `${FROM} ORDER BY name`);
  return rows.map(toTenant);
}

export async function createTenant(
  db: Queryable,
  input: CreateTenantInput,
): Promise<Tenant> {
  const row = await queryOne<TenantRow>(
    db,
    `INSERT INTO cannabis.tenant (name, deployment_mode, status, metadata)
     VALUES ($1, $2, $3, $4)
     RETURNING ${COLS}`,
    [
      input.name,
      input.deploymentMode ?? "saas",
      input.status ?? "active",
      input.metadata ?? {},
    ],
  );
  if (row === undefined) throw new Error("INSERT returned no row");
  return toTenant(row);
}

export async function updateTenant(
  db: Queryable,
  id: string,
  input: UpdateTenantInput,
): Promise<Tenant | undefined> {
  const sets: Array<[string, unknown]> = [];
  if (input.name !== undefined) sets.push(["name", input.name]);
  if (input.deploymentMode !== undefined)
    sets.push(["deployment_mode", input.deploymentMode]);
  if (input.status !== undefined) sets.push(["status", input.status]);
  if (input.metadata !== undefined) sets.push(["metadata", input.metadata]);

  if (sets.length === 0) return findTenantById(db, id);

  const setClause = sets.map(([col], i) => `${col} = $${i + 1}`).join(", ");
  const values = sets.map(([, v]) => v);

  const row = await queryOne<TenantRow>(
    db,
    `UPDATE cannabis.tenant SET ${setClause}
     WHERE id = $${sets.length + 1}
     RETURNING ${COLS}`,
    [...values, id],
  );
  return row !== undefined ? toTenant(row) : undefined;
}

export async function deleteTenant(db: Queryable, id: string): Promise<boolean> {
  const count = await execute(db, "DELETE FROM cannabis.tenant WHERE id = $1", [id]);
  return count > 0;
}
