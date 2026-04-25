/**
 * Shared domain types for CanopyTrace.
 *
 * These are intentionally thin branded-string wrappers and plain value types —
 * no ORM decorators, no DB dependencies. Both the API and the worker import
 * from here so the contract stays consistent.
 */

// ---------------------------------------------------------------------------
// Branded primitive helpers
// ---------------------------------------------------------------------------

declare const __brand: unique symbol;
type Brand<T, B> = T & { [__brand]: B };

export type UuidV4 = Brand<string, "UuidV4">;
export type FacilityId = Brand<string, "FacilityId">;
export type OrganizationId = Brand<string, "OrganizationId">;
export type TenantId = Brand<string, "TenantId">;

// ---------------------------------------------------------------------------
// Common status enums
// ---------------------------------------------------------------------------

export type ActiveStatus = "active" | "inactive" | "suspended";
export type DeploymentMode = "saas" | "self_hosted" | "byoi";

// ---------------------------------------------------------------------------
// Governance
// ---------------------------------------------------------------------------

export type JurisdictionId = Brand<string, "JurisdictionId">;
export type LicenseId = Brand<string, "LicenseId">;
export type RegulatorySystemId = Brand<string, "RegulatorySystemId">;
export type FacilityRegulatorBindingId = Brand<string, "FacilityRegulatorBindingId">;

export type RegulatoryEnvironment = "sandbox" | "production";

export interface Tenant {
  id: TenantId;
  name: string;
  deploymentMode: DeploymentMode;
  status: ActiveStatus;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface Organization {
  id: OrganizationId;
  tenantId: TenantId;
  legalName: string;
  dbaName: string | null;
  status: ActiveStatus;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export type FacilityType =
  | "cultivation"
  | "processing"
  | "retail"
  | "distribution"
  | "lab"
  | "mixed";

export interface Facility {
  id: FacilityId;
  organizationId: OrganizationId;
  jurisdictionId: JurisdictionId;
  name: string;
  facilityType: FacilityType;
  timezone: string;
  status: ActiveStatus;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface Jurisdiction {
  id: JurisdictionId;
  code: string;
  name: string;
  countryCode: string;
  status: ActiveStatus;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface License {
  id: LicenseId;
  organizationId: OrganizationId;
  jurisdictionId: JurisdictionId;
  licenseNumber: string;
  licenseType: string;
  issuerName: string | null;
  issuedOn: Date | null;
  expiresOn: Date | null;
  status: ActiveStatus;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface FacilityRegulatorBinding {
  id: FacilityRegulatorBindingId;
  facilityId: FacilityId;
  regulatorySystemId: RegulatorySystemId;
  environment: RegulatoryEnvironment;
  facilityExternalId: string | null;
  adapterRoute: string | null;
  policyPack: string;
  status: ActiveStatus;
  active: boolean;
  lastSyncedAt: Date | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Cultivation
// ---------------------------------------------------------------------------

export type GrowthPhase = "clone" | "seedling" | "veg" | "flower" | "harvest";

export type PlantStatus = "active" | "harvested" | "destroyed" | "quarantined";

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

export type LotKind =
  | "biomass"
  | "extract"
  | "wip"
  | "bulk_finished"
  | "waste"
  | "trim"
  | "crude_oil"
  | "distillate"
  | "edible_batch";

export type LedgerEventType =
  | "create"
  | "move"
  | "adjust"
  | "consume"
  | "produce"
  | "package"
  | "split"
  | "merge"
  | "hold"
  | "release"
  | "waste"
  | "sale";

// ---------------------------------------------------------------------------
// Regulatory sync
// ---------------------------------------------------------------------------

export type SyncStatus = "queued" | "processing" | "succeeded" | "failed" | "dead_letter";

export type SyncOperation =
  | "create"
  | "update"
  | "delete"
  | "submit"
  | "receive"
  | "reconcile";

export type RegulatorySystemCode = "metrc" | "biotrack";

// ---------------------------------------------------------------------------
// API response envelope
// ---------------------------------------------------------------------------

export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export interface ApiError {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

export interface PaginationParams {
  page: number;
  pageSize: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
