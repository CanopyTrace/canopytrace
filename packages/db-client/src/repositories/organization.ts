import type {
  ActiveStatus,
  Organization,
  OrganizationId,
  TenantId,
} from "@canopytrace/shared";

import { execute, queryOne, queryRows, type Queryable } from "../query.js";

interface OrganizationRow {
  id: string;
  tenant_id: string;
  legal_name: string;
  dba_name: string | null;
  status: string;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

const COLS =
  "id, tenant_id, legal_name, dba_name, status, metadata, created_at, updated_at";
const FROM = `SELECT ${COLS} FROM cannabis.organization`;

function toOrganization(row: OrganizationRow): Organization {
  return {
    id: row.id as OrganizationId,
    tenantId: row.tenant_id as TenantId,
    legalName: row.legal_name,
    dbaName: row.dba_name,
    status: row.status as ActiveStatus,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface CreateOrganizationInput {
  tenantId: string;
  legalName: string;
  dbaName?: string;
  status?: ActiveStatus;
  metadata?: Record<string, unknown>;
}

export interface UpdateOrganizationInput {
  legalName?: string;
  dbaName?: string | null;
  status?: ActiveStatus;
  metadata?: Record<string, unknown>;
}

export async function findOrganizationById(
  db: Queryable,
  id: string,
): Promise<Organization | undefined> {
  const row = await queryOne<OrganizationRow>(db, `${FROM} WHERE id = $1`, [id]);
  return row !== undefined ? toOrganization(row) : undefined;
}

export async function listOrganizationsByTenant(
  db: Queryable,
  tenantId: string,
): Promise<Organization[]> {
  const rows = await queryRows<OrganizationRow>(
    db,
    `${FROM} WHERE tenant_id = $1 ORDER BY legal_name`,
    [tenantId],
  );
  return rows.map(toOrganization);
}

export async function createOrganization(
  db: Queryable,
  input: CreateOrganizationInput,
): Promise<Organization> {
  const row = await queryOne<OrganizationRow>(
    db,
    `INSERT INTO cannabis.organization
       (tenant_id, legal_name, dba_name, status, metadata)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${COLS}`,
    [
      input.tenantId,
      input.legalName,
      input.dbaName ?? null,
      input.status ?? "active",
      input.metadata ?? {},
    ],
  );
  if (row === undefined) throw new Error("INSERT returned no row");
  return toOrganization(row);
}

export async function updateOrganization(
  db: Queryable,
  id: string,
  input: UpdateOrganizationInput,
): Promise<Organization | undefined> {
  const sets: Array<[string, unknown]> = [];
  if (input.legalName !== undefined) sets.push(["legal_name", input.legalName]);
  if (input.dbaName !== undefined) sets.push(["dba_name", input.dbaName]);
  if (input.status !== undefined) sets.push(["status", input.status]);
  if (input.metadata !== undefined) sets.push(["metadata", input.metadata]);

  if (sets.length === 0) return findOrganizationById(db, id);

  const setClause = sets.map(([col], i) => `${col} = $${i + 1}`).join(", ");
  const values = sets.map(([, v]) => v);

  const row = await queryOne<OrganizationRow>(
    db,
    `UPDATE cannabis.organization SET ${setClause}
     WHERE id = $${sets.length + 1}
     RETURNING ${COLS}`,
    [...values, id],
  );
  return row !== undefined ? toOrganization(row) : undefined;
}

export async function deleteOrganization(db: Queryable, id: string): Promise<boolean> {
  const count = await execute(db, "DELETE FROM cannabis.organization WHERE id = $1", [
    id,
  ]);
  return count > 0;
}
