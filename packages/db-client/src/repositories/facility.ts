import type {
  ActiveStatus,
  Facility,
  FacilityId,
  FacilityType,
  JurisdictionId,
  OrganizationId,
} from "@canopytrace/shared";

import { execute, queryOne, queryRows, type Queryable } from "../query.js";

interface FacilityRow {
  id: string;
  organization_id: string;
  jurisdiction_id: string;
  name: string;
  facility_type: string;
  timezone: string;
  status: string;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

const COLS =
  "id, organization_id, jurisdiction_id, name, facility_type, timezone, status, metadata, created_at, updated_at";
const FROM = `SELECT ${COLS} FROM cannabis.facility`;

function toFacility(row: FacilityRow): Facility {
  return {
    id: row.id as FacilityId,
    organizationId: row.organization_id as OrganizationId,
    jurisdictionId: row.jurisdiction_id as JurisdictionId,
    name: row.name,
    facilityType: row.facility_type as FacilityType,
    timezone: row.timezone,
    status: row.status as ActiveStatus,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface CreateFacilityInput {
  organizationId: string;
  jurisdictionId: string;
  name: string;
  facilityType: FacilityType;
  timezone?: string;
  status?: ActiveStatus;
  metadata?: Record<string, unknown>;
}

export interface UpdateFacilityInput {
  name?: string;
  facilityType?: FacilityType;
  timezone?: string;
  status?: ActiveStatus;
  metadata?: Record<string, unknown>;
}

export async function findFacilityById(
  db: Queryable,
  id: string,
): Promise<Facility | undefined> {
  const row = await queryOne<FacilityRow>(db, `${FROM} WHERE id = $1`, [id]);
  return row !== undefined ? toFacility(row) : undefined;
}

export async function listFacilitiesByOrganization(
  db: Queryable,
  organizationId: string,
): Promise<Facility[]> {
  const rows = await queryRows<FacilityRow>(
    db,
    `${FROM} WHERE organization_id = $1 ORDER BY name`,
    [organizationId],
  );
  return rows.map(toFacility);
}

export async function createFacility(
  db: Queryable,
  input: CreateFacilityInput,
): Promise<Facility> {
  const row = await queryOne<FacilityRow>(
    db,
    `INSERT INTO cannabis.facility
       (organization_id, jurisdiction_id, name, facility_type, timezone, status, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING ${COLS}`,
    [
      input.organizationId,
      input.jurisdictionId,
      input.name,
      input.facilityType,
      input.timezone ?? "UTC",
      input.status ?? "active",
      input.metadata ?? {},
    ],
  );
  if (row === undefined) throw new Error("INSERT returned no row");
  return toFacility(row);
}

export async function updateFacility(
  db: Queryable,
  id: string,
  input: UpdateFacilityInput,
): Promise<Facility | undefined> {
  const sets: Array<[string, unknown]> = [];
  if (input.name !== undefined) sets.push(["name", input.name]);
  if (input.facilityType !== undefined) sets.push(["facility_type", input.facilityType]);
  if (input.timezone !== undefined) sets.push(["timezone", input.timezone]);
  if (input.status !== undefined) sets.push(["status", input.status]);
  if (input.metadata !== undefined) sets.push(["metadata", input.metadata]);

  if (sets.length === 0) return findFacilityById(db, id);

  const setClause = sets.map(([col], i) => `${col} = $${i + 1}`).join(", ");
  const values = sets.map(([, v]) => v);

  const row = await queryOne<FacilityRow>(
    db,
    `UPDATE cannabis.facility SET ${setClause}
     WHERE id = $${sets.length + 1}
     RETURNING ${COLS}`,
    [...values, id],
  );
  return row !== undefined ? toFacility(row) : undefined;
}

export async function deleteFacility(db: Queryable, id: string): Promise<boolean> {
  const count = await execute(db, "DELETE FROM cannabis.facility WHERE id = $1", [id]);
  return count > 0;
}
