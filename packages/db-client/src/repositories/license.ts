import type {
  ActiveStatus,
  JurisdictionId,
  License,
  LicenseId,
  OrganizationId,
} from "@canopytrace/shared";

import { execute, queryOne, queryRows, type Queryable } from "../query.js";

interface LicenseRow {
  id: string;
  organization_id: string;
  jurisdiction_id: string;
  license_number: string;
  license_type: string;
  issuer_name: string | null;
  issued_on: Date | null;
  expires_on: Date | null;
  status: string;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

const COLS =
  "id, organization_id, jurisdiction_id, license_number, license_type, issuer_name, issued_on, expires_on, status, metadata, created_at, updated_at";
const FROM = `SELECT ${COLS} FROM cannabis.license`;

function toLicense(row: LicenseRow): License {
  return {
    id: row.id as LicenseId,
    organizationId: row.organization_id as OrganizationId,
    jurisdictionId: row.jurisdiction_id as JurisdictionId,
    licenseNumber: row.license_number,
    licenseType: row.license_type,
    issuerName: row.issuer_name,
    issuedOn: row.issued_on,
    expiresOn: row.expires_on,
    status: row.status as ActiveStatus,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface CreateLicenseInput {
  organizationId: string;
  jurisdictionId: string;
  licenseNumber: string;
  licenseType: string;
  issuerName?: string;
  issuedOn?: Date;
  expiresOn?: Date;
  status?: ActiveStatus;
  metadata?: Record<string, unknown>;
}

export interface UpdateLicenseInput {
  licenseType?: string;
  issuerName?: string | null;
  issuedOn?: Date | null;
  expiresOn?: Date | null;
  status?: ActiveStatus;
  metadata?: Record<string, unknown>;
}

export async function findLicenseById(
  db: Queryable,
  id: string,
): Promise<License | undefined> {
  const row = await queryOne<LicenseRow>(db, `${FROM} WHERE id = $1`, [id]);
  return row !== undefined ? toLicense(row) : undefined;
}

export async function findLicenseByNumber(
  db: Queryable,
  jurisdictionId: string,
  licenseNumber: string,
): Promise<License | undefined> {
  const row = await queryOne<LicenseRow>(
    db,
    `${FROM} WHERE jurisdiction_id = $1 AND license_number = $2`,
    [jurisdictionId, licenseNumber],
  );
  return row !== undefined ? toLicense(row) : undefined;
}

export async function listLicensesByOrganization(
  db: Queryable,
  organizationId: string,
): Promise<License[]> {
  const rows = await queryRows<LicenseRow>(
    db,
    `${FROM} WHERE organization_id = $1 ORDER BY license_number`,
    [organizationId],
  );
  return rows.map(toLicense);
}

export async function createLicense(
  db: Queryable,
  input: CreateLicenseInput,
): Promise<License> {
  const row = await queryOne<LicenseRow>(
    db,
    `INSERT INTO cannabis.license
       (organization_id, jurisdiction_id, license_number, license_type,
        issuer_name, issued_on, expires_on, status, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING ${COLS}`,
    [
      input.organizationId,
      input.jurisdictionId,
      input.licenseNumber,
      input.licenseType,
      input.issuerName ?? null,
      input.issuedOn ?? null,
      input.expiresOn ?? null,
      input.status ?? "active",
      input.metadata ?? {},
    ],
  );
  if (row === undefined) throw new Error("INSERT returned no row");
  return toLicense(row);
}

export async function updateLicense(
  db: Queryable,
  id: string,
  input: UpdateLicenseInput,
): Promise<License | undefined> {
  const sets: Array<[string, unknown]> = [];
  if (input.licenseType !== undefined) sets.push(["license_type", input.licenseType]);
  if (input.issuerName !== undefined) sets.push(["issuer_name", input.issuerName]);
  if (input.issuedOn !== undefined) sets.push(["issued_on", input.issuedOn]);
  if (input.expiresOn !== undefined) sets.push(["expires_on", input.expiresOn]);
  if (input.status !== undefined) sets.push(["status", input.status]);
  if (input.metadata !== undefined) sets.push(["metadata", input.metadata]);

  if (sets.length === 0) return findLicenseById(db, id);

  const setClause = sets.map(([col], i) => `${col} = $${i + 1}`).join(", ");
  const values = sets.map(([, v]) => v);

  const row = await queryOne<LicenseRow>(
    db,
    `UPDATE cannabis.license SET ${setClause}
     WHERE id = $${sets.length + 1}
     RETURNING ${COLS}`,
    [...values, id],
  );
  return row !== undefined ? toLicense(row) : undefined;
}

export async function deleteLicense(db: Queryable, id: string): Promise<boolean> {
  const count = await execute(db, "DELETE FROM cannabis.license WHERE id = $1", [id]);
  return count > 0;
}
