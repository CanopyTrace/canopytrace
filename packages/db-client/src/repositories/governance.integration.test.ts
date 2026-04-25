import path from "node:path";

import { PostgreSqlContainer } from "@testcontainers/postgresql";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { runner } from "node-pg-migrate";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DbError } from "../errors.js";
import { createPool } from "../pool.js";
import { queryRows } from "../query.js";

import {
  createBinding,
  createFacility,
  createJurisdiction,
  createLicense,
  createOrganization,
  createTenant,
  deleteBinding,
  deleteFacility,
  deleteJurisdiction,
  deleteLicense,
  deleteOrganization,
  deleteTenant,
  findActiveBinding,
  findBindingById,
  findFacilityById,
  findJurisdictionByCode,
  findJurisdictionById,
  findLicenseById,
  findLicenseByNumber,
  findOrganizationById,
  findTenantById,
  listBindingsByFacility,
  listFacilitiesByOrganization,
  listJurisdictions,
  listLicensesByOrganization,
  listOrganizationsByTenant,
  listTenants,
  updateBinding,
  updateFacility,
  updateJurisdiction,
  updateLicense,
  updateOrganization,
  updateTenant,
} from "./index.js";

// pnpm sets cwd to the package root before running scripts
const MIGRATIONS_DIR = path.resolve(process.cwd(), "../db/migrations");

describe("governance repositories", () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine")
      .withEnvironment({ TZ: "UTC", PGTZ: "UTC" })
      .start();
    pool = createPool({ url: container.getConnectionUri(), poolMin: 1 });
    await runner({
      databaseUrl: container.getConnectionUri(),
      dir: MIGRATIONS_DIR,
      migrationsTable: "schema_migrations",
      direction: "up",
      count: Infinity,
      log: () => {},
    });
  });

  afterAll(async () => {
    await pool.end();
    await container.stop();
  });

  // ---------------------------------------------------------------------------
  // tenant
  // ---------------------------------------------------------------------------

  describe("tenant", () => {
    let tenantId: string;

    it("creates a tenant and finds it by id", async () => {
      const t = await createTenant(pool, { name: "Acme Cannabis Co" });
      tenantId = t.id;
      expect(t.name).toBe("Acme Cannabis Co");
      expect(t.deploymentMode).toBe("saas");
      expect(t.status).toBe("active");

      const found = await findTenantById(pool, tenantId);
      expect(found?.id).toBe(tenantId);
    });

    it("lists all tenants", async () => {
      await createTenant(pool, { name: "Beta Dispensary" });
      const list = await listTenants(pool);
      expect(list.length).toBeGreaterThanOrEqual(2);
      expect(list.map((t) => t.name)).toContain("Acme Cannabis Co");
    });

    it("updates a tenant", async () => {
      const updated = await updateTenant(pool, tenantId, {
        status: "inactive",
        metadata: { note: "test" },
      });
      expect(updated?.status).toBe("inactive");
      expect(updated?.metadata).toEqual({ note: "test" });
    });

    it("update with no fields returns current record", async () => {
      const same = await updateTenant(pool, tenantId, {});
      expect(same?.id).toBe(tenantId);
    });

    it("findTenantById returns undefined for unknown id", async () => {
      const none = await findTenantById(pool, "00000000-0000-0000-0000-000000000000");
      expect(none).toBeUndefined();
    });

    it("deletes a tenant", async () => {
      const t = await createTenant(pool, { name: "To Delete" });
      expect(await deleteTenant(pool, t.id)).toBe(true);
      expect(await findTenantById(pool, t.id)).toBeUndefined();
    });

    it("delete returns false for unknown id", async () => {
      expect(await deleteTenant(pool, "00000000-0000-0000-0000-000000000000")).toBe(
        false,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // jurisdiction
  // ---------------------------------------------------------------------------

  describe("jurisdiction", () => {
    let jId: string;

    it("creates a jurisdiction and finds it by id", async () => {
      const j = await createJurisdiction(pool, { code: "NY", name: "New York" });
      jId = j.id;
      expect(j.code).toBe("NY");
      expect(j.countryCode).toBe("US");
      expect(j.status).toBe("active");

      const found = await findJurisdictionById(pool, jId);
      expect(found?.id).toBe(jId);
    });

    it("finds a jurisdiction by code", async () => {
      const found = await findJurisdictionByCode(pool, "NY");
      expect(found?.id).toBe(jId);
    });

    it("lists jurisdictions", async () => {
      await createJurisdiction(pool, { code: "CA", name: "California" });
      const list = await listJurisdictions(pool);
      const codes = list.map((j) => j.code);
      expect(codes).toContain("NY");
      expect(codes).toContain("CA");
    });

    it("updates a jurisdiction", async () => {
      const updated = await updateJurisdiction(pool, jId, { status: "inactive" });
      expect(updated?.status).toBe("inactive");
    });

    it("duplicate code raises DbError unique_violation", async () => {
      await expect(
        createJurisdiction(pool, { code: "NY", name: "New York Duplicate" }),
      ).rejects.toSatisfy(
        (e: unknown) => e instanceof DbError && e.code === "unique_violation",
      );
    });

    it("deletes a jurisdiction", async () => {
      const j = await createJurisdiction(pool, {
        code: "DEL-J",
        name: "Delete Me",
      });
      expect(await deleteJurisdiction(pool, j.id)).toBe(true);
      expect(await findJurisdictionById(pool, j.id)).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // organization
  // ---------------------------------------------------------------------------

  describe("organization", () => {
    let tenantId: string;
    let orgId: string;

    beforeAll(async () => {
      const t = await createTenant(pool, { name: "Org Test Tenant" });
      tenantId = t.id;
    });

    it("creates an organization and finds it by id", async () => {
      const org = await createOrganization(pool, {
        tenantId,
        legalName: "Green Leaf LLC",
        dbaName: "Green Leaf",
      });
      orgId = org.id;
      expect(org.legalName).toBe("Green Leaf LLC");
      expect(org.dbaName).toBe("Green Leaf");
      expect(org.tenantId).toBe(tenantId);

      const found = await findOrganizationById(pool, orgId);
      expect(found?.id).toBe(orgId);
    });

    it("lists organizations by tenant", async () => {
      await createOrganization(pool, {
        tenantId,
        legalName: "Second Org LLC",
      });
      const list = await listOrganizationsByTenant(pool, tenantId);
      expect(list.length).toBe(2);
      expect(list.map((o) => o.legalName)).toContain("Green Leaf LLC");
    });

    it("lists organizations excludes other tenants", async () => {
      const otherTenant = await createTenant(pool, { name: "Other Tenant" });
      await createOrganization(pool, {
        tenantId: otherTenant.id,
        legalName: "Other Org",
      });
      const list = await listOrganizationsByTenant(pool, tenantId);
      expect(list.map((o) => o.legalName)).not.toContain("Other Org");
    });

    it("updates an organization", async () => {
      const updated = await updateOrganization(pool, orgId, {
        dbaName: "GL Updated",
      });
      expect(updated?.dbaName).toBe("GL Updated");
    });

    it("unknown tenant FK raises DbError foreign_key_violation", async () => {
      await expect(
        createOrganization(pool, {
          tenantId: "00000000-0000-0000-0000-000000000099",
          legalName: "Ghost Org",
        }),
      ).rejects.toSatisfy(
        (e: unknown) => e instanceof DbError && e.code === "foreign_key_violation",
      );
    });

    it("deletes an organization", async () => {
      const org = await createOrganization(pool, {
        tenantId,
        legalName: "Delete Me Org",
      });
      expect(await deleteOrganization(pool, org.id)).toBe(true);
      expect(await findOrganizationById(pool, org.id)).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // facility
  // ---------------------------------------------------------------------------

  describe("facility", () => {
    let tenantId: string;
    let orgId: string;
    let jId: string;
    let facId: string;

    beforeAll(async () => {
      const t = await createTenant(pool, { name: "Facility Test Tenant" });
      tenantId = t.id;
      const org = await createOrganization(pool, {
        tenantId,
        legalName: "Facility Test Org",
      });
      orgId = org.id;
      const j = await createJurisdiction(pool, {
        code: "FL",
        name: "Florida",
      });
      jId = j.id;
    });

    it("creates a facility and finds it by id", async () => {
      const fac = await createFacility(pool, {
        organizationId: orgId,
        jurisdictionId: jId,
        name: "Main Cultivation Site",
        facilityType: "cultivation",
      });
      facId = fac.id;
      expect(fac.name).toBe("Main Cultivation Site");
      expect(fac.facilityType).toBe("cultivation");
      expect(fac.timezone).toBe("UTC");
      expect(fac.jurisdictionId).toBe(jId);

      const found = await findFacilityById(pool, facId);
      expect(found?.id).toBe(facId);
    });

    it("lists facilities by organization", async () => {
      await createFacility(pool, {
        organizationId: orgId,
        jurisdictionId: jId,
        name: "Secondary Retail",
        facilityType: "retail",
      });
      const list = await listFacilitiesByOrganization(pool, orgId);
      expect(list.length).toBe(2);
      expect(list.map((f) => f.name)).toContain("Main Cultivation Site");
    });

    it("updates a facility", async () => {
      const updated = await updateFacility(pool, facId, {
        timezone: "America/New_York",
        status: "inactive",
      });
      expect(updated?.timezone).toBe("America/New_York");
      expect(updated?.status).toBe("inactive");
    });

    it("deletes a facility", async () => {
      const fac = await createFacility(pool, {
        organizationId: orgId,
        jurisdictionId: jId,
        name: "Delete Me Facility",
        facilityType: "lab",
      });
      expect(await deleteFacility(pool, fac.id)).toBe(true);
      expect(await findFacilityById(pool, fac.id)).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // license
  // ---------------------------------------------------------------------------

  describe("license", () => {
    let orgId: string;
    let jId: string;
    let licId: string;

    beforeAll(async () => {
      const t = await createTenant(pool, { name: "License Test Tenant" });
      const org = await createOrganization(pool, {
        tenantId: t.id,
        legalName: "License Test Org",
      });
      orgId = org.id;
      const j = await createJurisdiction(pool, {
        code: "CO",
        name: "Colorado",
      });
      jId = j.id;
    });

    it("creates a license and finds it by id", async () => {
      const lic = await createLicense(pool, {
        organizationId: orgId,
        jurisdictionId: jId,
        licenseNumber: "MED-2024-001",
        licenseType: "medical_retail",
        issuerName: "Colorado MED",
      });
      licId = lic.id;
      expect(lic.licenseNumber).toBe("MED-2024-001");
      expect(lic.issuerName).toBe("Colorado MED");
      expect(lic.issuedOn).toBeNull();
      expect(lic.expiresOn).toBeNull();

      const found = await findLicenseById(pool, licId);
      expect(found?.id).toBe(licId);
    });

    it("finds a license by jurisdiction and number", async () => {
      const found = await findLicenseByNumber(pool, jId, "MED-2024-001");
      expect(found?.id).toBe(licId);
    });

    it("lists licenses by organization", async () => {
      await createLicense(pool, {
        organizationId: orgId,
        jurisdictionId: jId,
        licenseNumber: "RET-2024-002",
        licenseType: "adult_use_retail",
      });
      const list = await listLicensesByOrganization(pool, orgId);
      expect(list.length).toBe(2);
      expect(list.map((l) => l.licenseNumber)).toContain("MED-2024-001");
    });

    it("updates a license", async () => {
      const expiry = new Date("2025-12-31");
      const updated = await updateLicense(pool, licId, { expiresOn: expiry });
      // DATE columns are parsed as UTC midnight; use getUTC* to avoid local-TZ skew
      expect(updated?.expiresOn).toBeInstanceOf(Date);
      expect(updated?.expiresOn?.getUTCFullYear()).toBe(2025);
      expect(updated?.expiresOn?.getUTCMonth()).toBe(11); // 0-indexed December
      expect(updated?.expiresOn?.getUTCDate()).toBe(31);
    });

    it("duplicate (jurisdiction, license_number) raises DbError unique_violation", async () => {
      await expect(
        createLicense(pool, {
          organizationId: orgId,
          jurisdictionId: jId,
          licenseNumber: "MED-2024-001",
          licenseType: "medical_retail",
        }),
      ).rejects.toSatisfy(
        (e: unknown) => e instanceof DbError && e.code === "unique_violation",
      );
    });

    it("deletes a license", async () => {
      const lic = await createLicense(pool, {
        organizationId: orgId,
        jurisdictionId: jId,
        licenseNumber: "DEL-LIC-001",
        licenseType: "cultivation",
      });
      expect(await deleteLicense(pool, lic.id)).toBe(true);
      expect(await findLicenseById(pool, lic.id)).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // facility_regulator_binding
  // ---------------------------------------------------------------------------

  describe("facilityRegulatorBinding", () => {
    let facilityId: string;
    let regulatorySystemId: string;
    let bindId: string;

    beforeAll(async () => {
      const t = await createTenant(pool, { name: "Binding Test Tenant" });
      const org = await createOrganization(pool, {
        tenantId: t.id,
        legalName: "Binding Test Org",
      });
      const j = await createJurisdiction(pool, {
        code: "WA",
        name: "Washington",
      });
      const fac = await createFacility(pool, {
        organizationId: org.id,
        jurisdictionId: j.id,
        name: "Binding Test Facility",
        facilityType: "retail",
      });
      facilityId = fac.id;

      // Insert a regulatory_system directly — no repo yet
      const [rs] = await queryRows<{ id: string }>(
        pool,
        `INSERT INTO cannabis.regulatory_system (code, name)
         VALUES ('metrc-wa', 'Metrc Washington')
         RETURNING id`,
      );
      regulatorySystemId = rs!.id;
    });

    it("creates a binding and finds it by id", async () => {
      const b = await createBinding(pool, {
        facilityId,
        regulatorySystemId,
        environment: "sandbox",
        policyPack: "metrc-wa-v1",
        facilityExternalId: "WA-FAC-001",
      });
      bindId = b.id;
      expect(b.environment).toBe("sandbox");
      expect(b.policyPack).toBe("metrc-wa-v1");
      expect(b.facilityExternalId).toBe("WA-FAC-001");
      expect(b.active).toBe(true);
      expect(b.lastSyncedAt).toBeNull();

      const found = await findBindingById(pool, bindId);
      expect(found?.id).toBe(bindId);
    });

    it("finds the active binding for a facility/system/environment", async () => {
      const found = await findActiveBinding(
        pool,
        facilityId,
        regulatorySystemId,
        "sandbox",
      );
      expect(found?.id).toBe(bindId);
    });

    it("lists bindings by facility", async () => {
      const list = await listBindingsByFacility(pool, facilityId);
      expect(list.length).toBe(1);
      expect(list[0]?.id).toBe(bindId);
    });

    it("updates a binding — records lastSyncedAt", async () => {
      const now = new Date();
      const updated = await updateBinding(pool, bindId, { lastSyncedAt: now });
      expect(updated?.lastSyncedAt).toBeTruthy();
    });

    it("deactivating a binding makes findActiveBinding return undefined", async () => {
      await updateBinding(pool, bindId, { active: false });
      const found = await findActiveBinding(
        pool,
        facilityId,
        regulatorySystemId,
        "sandbox",
      );
      expect(found).toBeUndefined();
    });

    it("deletes a binding", async () => {
      const b = await createBinding(pool, {
        facilityId,
        regulatorySystemId,
        environment: "production",
        policyPack: "metrc-wa-v1",
      });
      expect(await deleteBinding(pool, b.id)).toBe(true);
      expect(await findBindingById(pool, b.id)).toBeUndefined();
    });
  });
});
