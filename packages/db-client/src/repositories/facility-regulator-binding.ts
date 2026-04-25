import type {
  ActiveStatus,
  FacilityId,
  FacilityRegulatorBinding,
  FacilityRegulatorBindingId,
  RegulatoryEnvironment,
  RegulatorySystemId,
} from "@canopytrace/shared";

import { execute, queryOne, queryRows, type Queryable } from "../query.js";

interface BindingRow {
  id: string;
  facility_id: string;
  regulatory_system_id: string;
  environment: string;
  facility_external_id: string | null;
  adapter_route: string | null;
  policy_pack: string;
  status: string;
  active: boolean;
  last_synced_at: Date | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

const COLS =
  "id, facility_id, regulatory_system_id, environment, facility_external_id, adapter_route, policy_pack, status, active, last_synced_at, metadata, created_at, updated_at";
const FROM = `SELECT ${COLS} FROM cannabis.facility_regulator_binding`;

function toBinding(row: BindingRow): FacilityRegulatorBinding {
  return {
    id: row.id as FacilityRegulatorBindingId,
    facilityId: row.facility_id as FacilityId,
    regulatorySystemId: row.regulatory_system_id as RegulatorySystemId,
    environment: row.environment as RegulatoryEnvironment,
    facilityExternalId: row.facility_external_id,
    adapterRoute: row.adapter_route,
    policyPack: row.policy_pack,
    status: row.status as ActiveStatus,
    active: row.active,
    lastSyncedAt: row.last_synced_at,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface CreateBindingInput {
  facilityId: string;
  regulatorySystemId: string;
  environment: RegulatoryEnvironment;
  policyPack: string;
  facilityExternalId?: string;
  adapterRoute?: string;
  status?: ActiveStatus;
  metadata?: Record<string, unknown>;
}

export interface UpdateBindingInput {
  facilityExternalId?: string | null;
  adapterRoute?: string | null;
  policyPack?: string;
  status?: ActiveStatus;
  active?: boolean;
  lastSyncedAt?: Date | null;
  metadata?: Record<string, unknown>;
}

export async function findBindingById(
  db: Queryable,
  id: string,
): Promise<FacilityRegulatorBinding | undefined> {
  const row = await queryOne<BindingRow>(db, `${FROM} WHERE id = $1`, [id]);
  return row !== undefined ? toBinding(row) : undefined;
}

export async function findActiveBinding(
  db: Queryable,
  facilityId: string,
  regulatorySystemId: string,
  environment: RegulatoryEnvironment,
): Promise<FacilityRegulatorBinding | undefined> {
  const row = await queryOne<BindingRow>(
    db,
    `${FROM}
     WHERE facility_id = $1
       AND regulatory_system_id = $2
       AND environment = $3
       AND active = true`,
    [facilityId, regulatorySystemId, environment],
  );
  return row !== undefined ? toBinding(row) : undefined;
}

export async function listBindingsByFacility(
  db: Queryable,
  facilityId: string,
): Promise<FacilityRegulatorBinding[]> {
  const rows = await queryRows<BindingRow>(
    db,
    `${FROM} WHERE facility_id = $1 ORDER BY created_at`,
    [facilityId],
  );
  return rows.map(toBinding);
}

export async function createBinding(
  db: Queryable,
  input: CreateBindingInput,
): Promise<FacilityRegulatorBinding> {
  const row = await queryOne<BindingRow>(
    db,
    `INSERT INTO cannabis.facility_regulator_binding
       (facility_id, regulatory_system_id, environment, policy_pack,
        facility_external_id, adapter_route, status, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING ${COLS}`,
    [
      input.facilityId,
      input.regulatorySystemId,
      input.environment,
      input.policyPack,
      input.facilityExternalId ?? null,
      input.adapterRoute ?? null,
      input.status ?? "active",
      input.metadata ?? {},
    ],
  );
  if (row === undefined) throw new Error("INSERT returned no row");
  return toBinding(row);
}

export async function updateBinding(
  db: Queryable,
  id: string,
  input: UpdateBindingInput,
): Promise<FacilityRegulatorBinding | undefined> {
  const sets: Array<[string, unknown]> = [];
  if (input.facilityExternalId !== undefined)
    sets.push(["facility_external_id", input.facilityExternalId]);
  if (input.adapterRoute !== undefined) sets.push(["adapter_route", input.adapterRoute]);
  if (input.policyPack !== undefined) sets.push(["policy_pack", input.policyPack]);
  if (input.status !== undefined) sets.push(["status", input.status]);
  if (input.active !== undefined) sets.push(["active", input.active]);
  if (input.lastSyncedAt !== undefined) sets.push(["last_synced_at", input.lastSyncedAt]);
  if (input.metadata !== undefined) sets.push(["metadata", input.metadata]);

  if (sets.length === 0) return findBindingById(db, id);

  const setClause = sets.map(([col], i) => `${col} = $${i + 1}`).join(", ");
  const values = sets.map(([, v]) => v);

  const row = await queryOne<BindingRow>(
    db,
    `UPDATE cannabis.facility_regulator_binding SET ${setClause}
     WHERE id = $${sets.length + 1}
     RETURNING ${COLS}`,
    [...values, id],
  );
  return row !== undefined ? toBinding(row) : undefined;
}

export async function deleteBinding(db: Queryable, id: string): Promise<boolean> {
  const count = await execute(
    db,
    "DELETE FROM cannabis.facility_regulator_binding WHERE id = $1",
    [id],
  );
  return count > 0;
}
