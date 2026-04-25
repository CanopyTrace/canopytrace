import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Client } from "pg";
import { runner } from "node-pg-migrate";

// pnpm always cds to the package root before running scripts
const MIGRATIONS_DIR = path.join(process.cwd(), "migrations");

// Representative sample: one table from each schema section
const REPRESENTATIVE_TABLES = [
  "tenant",
  "facility",
  "license",
  "strain",
  "plant",
  "material_lot",
  "package",
  "sale",
  "transfer",
  "outbox_event",
  "regulatory_sync_job",
  "audit_event",
  "app_user",
  "auth_identity",
  "role_definition",
  "role_binding",
  "module_definition",
  "module_setting",
  "document_asset",
  "document_binding",
] as const;

describe("migration smoke tests", () => {
  let container: StartedPostgreSqlContainer;
  let client: Client;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    client = new Client({ connectionString: container.getConnectionUri() });
    await client.connect();
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
    await client?.end();
    await container?.stop();
  });

  it("records all migrations in schema_migrations", async () => {
    const { rows } = await client.query<{ name: string }>(
      "SELECT name FROM public.schema_migrations ORDER BY run_on",
    );
    expect(rows).toHaveLength(4);
    expect(rows[0]?.name).toMatch(/baseline/);
    expect(rows[1]?.name).toMatch(/identity_role/);
    expect(rows[2]?.name).toMatch(/module_enablement/);
    expect(rows[3]?.name).toMatch(/document_tables/);
  });

  it.each(REPRESENTATIVE_TABLES)("cannabis.%s exists", async (table) => {
    const { rowCount } = await client.query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'cannabis' AND table_name = $1`,
      [table],
    );
    expect(rowCount).toBe(1);
  });

  it("updated_at trigger fires on cannabis.tenant", async () => {
    // Insert with an artificially old updated_at — this removes any timing dependency.
    const ancientDate = new Date("2000-01-01T00:00:00Z");
    await client.query(
      "INSERT INTO cannabis.tenant (name, updated_at) VALUES ('smoke-trigger', $1)",
      [ancientDate],
    );
    await client.query(
      "UPDATE cannabis.tenant SET name = 'smoke-trigger-done' WHERE name = 'smoke-trigger'",
    );
    const { rows } = await client.query<{ updated_at: Date }>(
      "SELECT updated_at FROM cannabis.tenant WHERE name = 'smoke-trigger-done'",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.updated_at.getTime()).toBeGreaterThan(ancientDate.getTime());
  });

  describe("Story 1.2.1 — identity and role tables", () => {
    let tenantId: string;
    let orgId: string;
    let facilityId: string;
    let roleDefId: string;
    let moduleDefId: string;

    beforeAll(async () => {
      const {
        rows: [t],
      } = await client.query<{ id: string }>(
        "INSERT INTO cannabis.tenant (name) VALUES ('iam-test') RETURNING id",
      );
      tenantId = t!.id;

      const {
        rows: [o],
      } = await client.query<{ id: string }>(
        "INSERT INTO cannabis.organization (tenant_id, legal_name) VALUES ($1, 'IAM Org') RETURNING id",
        [tenantId],
      );
      orgId = o!.id;

      const {
        rows: [j],
      } = await client.query<{ id: string }>(
        "INSERT INTO cannabis.jurisdiction (code, name) VALUES ('ZZ', 'Test Jurisdiction') RETURNING id",
      );

      const {
        rows: [f],
      } = await client.query<{ id: string }>(
        "INSERT INTO cannabis.facility (organization_id, jurisdiction_id, name, facility_type) VALUES ($1, $2, 'IAM Facility', 'retail') RETURNING id",
        [orgId, j!.id],
      );
      facilityId = f!.id;

      const {
        rows: [r],
      } = await client.query<{ id: string }>(
        "INSERT INTO cannabis.role_definition (tenant_id, name) VALUES ($1, 'iam-admin') RETURNING id",
        [tenantId],
      );
      roleDefId = r!.id;

      const {
        rows: [m],
      } = await client.query<{ id: string }>(
        "INSERT INTO cannabis.module_definition (code, name) VALUES ('iam-test-retail', 'IAM Test Retail') RETURNING id",
      );
      moduleDefId = m!.id;
    });

    // -------------------------------------------------------------------------
    // auth_identity constraint tests
    // -------------------------------------------------------------------------

    it("auth_identity accepts local identity with password_hash", async () => {
      const {
        rows: [u],
      } = await client.query<{ id: string }>(
        "INSERT INTO cannabis.app_user (tenant_id, email, full_name) VALUES ($1, 'local@iam.test', 'Local User') RETURNING id",
        [tenantId],
      );
      await expect(
        client.query(
          "INSERT INTO cannabis.auth_identity (app_user_id, provider, password_hash) VALUES ($1, 'local', '$2b$12$testhash') RETURNING id",
          [u!.id],
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
    });

    it("auth_identity rejects duplicate (user, provider)", async () => {
      const {
        rows: [u],
      } = await client.query<{ id: string }>(
        "INSERT INTO cannabis.app_user (tenant_id, email, full_name) VALUES ($1, 'dup@iam.test', 'Dup User') RETURNING id",
        [tenantId],
      );
      await client.query(
        "INSERT INTO cannabis.auth_identity (app_user_id, provider, password_hash) VALUES ($1, 'local', '$2b$12$hash1')",
        [u!.id],
      );
      await expect(
        client.query(
          "INSERT INTO cannabis.auth_identity (app_user_id, provider, password_hash) VALUES ($1, 'local', '$2b$12$hash2')",
          [u!.id],
        ),
      ).rejects.toThrow();
    });

    it("auth_identity rejects local identity without password_hash", async () => {
      const {
        rows: [u],
      } = await client.query<{ id: string }>(
        "INSERT INTO cannabis.app_user (tenant_id, email, full_name) VALUES ($1, 'nohash@iam.test', 'No Hash User') RETURNING id",
        [tenantId],
      );
      await expect(
        client.query(
          "INSERT INTO cannabis.auth_identity (app_user_id, provider) VALUES ($1, 'local')",
          [u!.id],
        ),
      ).rejects.toThrow();
    });

    it("auth_identity rejects oidc identity without provider_sub", async () => {
      const {
        rows: [u],
      } = await client.query<{ id: string }>(
        "INSERT INTO cannabis.app_user (tenant_id, email, full_name) VALUES ($1, 'nosub@iam.test', 'No Sub User') RETURNING id",
        [tenantId],
      );
      await expect(
        client.query(
          "INSERT INTO cannabis.auth_identity (app_user_id, provider) VALUES ($1, 'oidc')",
          [u!.id],
        ),
      ).rejects.toThrow();
    });

    it("auth_identity accepts oidc identity with provider_sub", async () => {
      const {
        rows: [u],
      } = await client.query<{ id: string }>(
        "INSERT INTO cannabis.app_user (tenant_id, email, full_name) VALUES ($1, 'oidc@iam.test', 'OIDC User') RETURNING id",
        [tenantId],
      );
      await expect(
        client.query(
          "INSERT INTO cannabis.auth_identity (app_user_id, provider, provider_sub) VALUES ($1, 'oidc', 'sub|12345') RETURNING id",
          [u!.id],
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
    });

    // -------------------------------------------------------------------------
    // role_binding constraint tests
    // -------------------------------------------------------------------------

    it("role_binding accepts tenant-scoped binding (no org or facility)", async () => {
      const {
        rows: [u],
      } = await client.query<{ id: string }>(
        "INSERT INTO cannabis.app_user (tenant_id, email, full_name) VALUES ($1, 'rb-tenant@iam.test', 'Tenant Scope User') RETURNING id",
        [tenantId],
      );
      await expect(
        client.query(
          "INSERT INTO cannabis.role_binding (app_user_id, role_definition_id) VALUES ($1, $2) RETURNING id",
          [u!.id, roleDefId],
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
    });

    it("role_binding accepts org-scoped binding", async () => {
      const {
        rows: [u],
      } = await client.query<{ id: string }>(
        "INSERT INTO cannabis.app_user (tenant_id, email, full_name) VALUES ($1, 'rb-org@iam.test', 'Org Scope User') RETURNING id",
        [tenantId],
      );
      await expect(
        client.query(
          "INSERT INTO cannabis.role_binding (app_user_id, role_definition_id, organization_id) VALUES ($1, $2, $3) RETURNING id",
          [u!.id, roleDefId, orgId],
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
    });

    it("role_binding accepts facility-scoped binding", async () => {
      const {
        rows: [u],
      } = await client.query<{ id: string }>(
        "INSERT INTO cannabis.app_user (tenant_id, email, full_name) VALUES ($1, 'rb-facility@iam.test', 'Facility Scope User') RETURNING id",
        [tenantId],
      );
      await expect(
        client.query(
          "INSERT INTO cannabis.role_binding (app_user_id, role_definition_id, facility_id) VALUES ($1, $2, $3) RETURNING id",
          [u!.id, roleDefId, facilityId],
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
    });

    it("role_binding rejects binding with both organization and facility set", async () => {
      const {
        rows: [u],
      } = await client.query<{ id: string }>(
        "INSERT INTO cannabis.app_user (tenant_id, email, full_name) VALUES ($1, 'rb-ambig@iam.test', 'Ambiguous User') RETURNING id",
        [tenantId],
      );
      await expect(
        client.query(
          "INSERT INTO cannabis.role_binding (app_user_id, role_definition_id, organization_id, facility_id) VALUES ($1, $2, $3, $4)",
          [u!.id, roleDefId, orgId, facilityId],
        ),
      ).rejects.toThrow();
    });

    it("role_binding accepts module-scoped binding", async () => {
      const {
        rows: [u],
      } = await client.query<{ id: string }>(
        "INSERT INTO cannabis.app_user (tenant_id, email, full_name) VALUES ($1, 'rb-module@iam.test', 'Module Scope User') RETURNING id",
        [tenantId],
      );
      await expect(
        client.query(
          "INSERT INTO cannabis.role_binding (app_user_id, role_definition_id, facility_id, module_definition_id) VALUES ($1, $2, $3, $4) RETURNING id",
          [u!.id, roleDefId, facilityId, moduleDefId],
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
    });
  });

  describe("Story 1.2.2 — module definition and module setting tables", () => {
    let tenantId: string;
    let orgId: string;
    let facilityId: string;
    let modCultId: string;
    let modRetailId: string;

    beforeAll(async () => {
      const {
        rows: [t],
      } = await client.query<{ id: string }>(
        "INSERT INTO cannabis.tenant (name) VALUES ('mod-test') RETURNING id",
      );
      tenantId = t!.id;

      const {
        rows: [o],
      } = await client.query<{ id: string }>(
        "INSERT INTO cannabis.organization (tenant_id, legal_name) VALUES ($1, 'Mod Org') RETURNING id",
        [tenantId],
      );
      orgId = o!.id;

      const {
        rows: [j],
      } = await client.query<{ id: string }>(
        "INSERT INTO cannabis.jurisdiction (code, name) VALUES ('QQ', 'Mod Jurisdiction') RETURNING id",
      );

      const {
        rows: [f],
      } = await client.query<{ id: string }>(
        "INSERT INTO cannabis.facility (organization_id, jurisdiction_id, name, facility_type) VALUES ($1, $2, 'Mod Facility', 'cultivation') RETURNING id",
        [orgId, j!.id],
      );
      facilityId = f!.id;

      const {
        rows: [mc],
      } = await client.query<{ id: string }>(
        "INSERT INTO cannabis.module_definition (code, name, compatible_facility_types) VALUES ('mod-test-cultivation', 'Mod Test Cultivation', '{cultivation}') RETURNING id",
      );
      modCultId = mc!.id;

      const {
        rows: [mr],
      } = await client.query<{ id: string }>(
        "INSERT INTO cannabis.module_definition (code, name, compatible_facility_types) VALUES ('mod-test-retail', 'Mod Test Retail', '{retail}') RETURNING id",
      );
      modRetailId = mr!.id;
    });

    // -------------------------------------------------------------------------
    // scope validity tests (baseline CHECK)
    // -------------------------------------------------------------------------

    it("module_setting accepts tenant-scoped setting", async () => {
      await expect(
        client.query(
          "INSERT INTO cannabis.module_setting (module_definition_id, tenant_id, enabled) VALUES ($1, $2, true) RETURNING id",
          [modCultId, tenantId],
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
    });

    it("module_setting accepts organization-scoped setting", async () => {
      await expect(
        client.query(
          "INSERT INTO cannabis.module_setting (module_definition_id, organization_id, enabled) VALUES ($1, $2, true) RETURNING id",
          [modCultId, orgId],
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
    });

    it("module_setting accepts facility-scoped setting", async () => {
      await expect(
        client.query(
          "INSERT INTO cannabis.module_setting (module_definition_id, facility_id, enabled) VALUES ($1, $2, true) RETURNING id",
          [modCultId, facilityId],
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
    });

    it("module_setting rejects setting with no scope", async () => {
      await expect(
        client.query(
          "INSERT INTO cannabis.module_setting (module_definition_id, enabled) VALUES ($1, true)",
          [modRetailId],
        ),
      ).rejects.toThrow();
    });

    it("module_setting rejects setting with multiple scopes", async () => {
      await expect(
        client.query(
          "INSERT INTO cannabis.module_setting (module_definition_id, tenant_id, organization_id, enabled) VALUES ($1, $2, $3, true)",
          [modRetailId, tenantId, orgId],
        ),
      ).rejects.toThrow();
    });

    // -------------------------------------------------------------------------
    // duplicate scope collision tests (Story 1.2.2 unique indexes)
    // -------------------------------------------------------------------------

    it("module_setting rejects duplicate (module, tenant) setting", async () => {
      await expect(
        client.query(
          "INSERT INTO cannabis.module_setting (module_definition_id, tenant_id, enabled) VALUES ($1, $2, false)",
          [modCultId, tenantId],
        ),
      ).rejects.toThrow();
    });

    it("module_setting rejects duplicate (module, organization) setting", async () => {
      await expect(
        client.query(
          "INSERT INTO cannabis.module_setting (module_definition_id, organization_id, enabled) VALUES ($1, $2, false)",
          [modCultId, orgId],
        ),
      ).rejects.toThrow();
    });

    it("module_setting rejects duplicate (module, facility) setting", async () => {
      await expect(
        client.query(
          "INSERT INTO cannabis.module_setting (module_definition_id, facility_id, enabled) VALUES ($1, $2, false)",
          [modCultId, facilityId],
        ),
      ).rejects.toThrow();
    });
  });

  describe("Story 1.2.3 — document asset and document binding tables", () => {
    let tenantId: string;
    let facilityId: string;
    let assetId: string;

    beforeAll(async () => {
      const {
        rows: [t],
      } = await client.query<{ id: string }>(
        "INSERT INTO cannabis.tenant (name) VALUES ('doc-test') RETURNING id",
      );
      tenantId = t!.id;

      const {
        rows: [o],
      } = await client.query<{ id: string }>(
        "INSERT INTO cannabis.organization (tenant_id, legal_name) VALUES ($1, 'Doc Org') RETURNING id",
        [tenantId],
      );

      const {
        rows: [j],
      } = await client.query<{ id: string }>(
        "INSERT INTO cannabis.jurisdiction (code, name) VALUES ('WW', 'Doc Jurisdiction') RETURNING id",
      );

      const {
        rows: [f],
      } = await client.query<{ id: string }>(
        "INSERT INTO cannabis.facility (organization_id, jurisdiction_id, name, facility_type) VALUES ($1, $2, 'Doc Facility', 'retail') RETURNING id",
        [o!.id, j!.id],
      );
      facilityId = f!.id;

      // Base asset used by most binding tests.
      const {
        rows: [a],
      } = await client.query<{ id: string }>(
        `INSERT INTO cannabis.document_asset
           (tenant_id, facility_id, asset_class, storage_key, bucket,
            file_name, content_type, size_bytes, sha256, retention_class)
         VALUES ($1, $2, 'evidence', 'uploads/doc-test/coa-001.pdf', 'canopy-docs',
                 'coa-001.pdf', 'application/pdf', 204800,
                 'abc123def456abc123def456abc123def456abc123def456abc123def456abcd',
                 'standard')
         RETURNING id`,
        [tenantId, facilityId],
      );
      assetId = a!.id;
    });

    // -------------------------------------------------------------------------
    // document_asset tests
    // -------------------------------------------------------------------------

    it("document_asset stores checksum, media type, size, and retention class", async () => {
      const { rows } = await client.query<{
        sha256: string;
        content_type: string;
        size_bytes: string;
        retention_class: string;
      }>(
        "SELECT sha256, content_type, size_bytes, retention_class FROM cannabis.document_asset WHERE id = $1",
        [assetId],
      );
      expect(rows[0]?.sha256).toBe(
        "abc123def456abc123def456abc123def456abc123def456abc123def456abcd",
      );
      expect(rows[0]?.content_type).toBe("application/pdf");
      expect(rows[0]?.size_bytes).toBe("204800");
      expect(rows[0]?.retention_class).toBe("standard");
    });

    it("document_asset rejects duplicate (bucket, storage_key)", async () => {
      await expect(
        client.query(
          `INSERT INTO cannabis.document_asset
             (tenant_id, asset_class, storage_key, bucket, retention_class)
           VALUES ($1, 'evidence', 'uploads/doc-test/coa-001.pdf', 'canopy-docs', 'standard')`,
          [tenantId],
        ),
      ).rejects.toThrow();
    });

    it("document_asset accepts nullable sha256 and content_type", async () => {
      await expect(
        client.query(
          `INSERT INTO cannabis.document_asset
             (tenant_id, asset_class, storage_key, bucket, retention_class)
           VALUES ($1, 'system_artifact', 'exports/doc-test/report.csv', 'canopy-docs', 'standard')
           RETURNING id`,
          [tenantId],
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
    });

    // -------------------------------------------------------------------------
    // document_binding tests
    // -------------------------------------------------------------------------

    it("document_binding binds asset to arbitrary object type and ID", async () => {
      const objectId = "00000000-0000-0000-0000-000000000001";
      await expect(
        client.query(
          `INSERT INTO cannabis.document_binding
             (document_asset_id, object_type, object_id, binding_role)
           VALUES ($1, 'plant_batch', $2, 'coa')
           RETURNING id`,
          [assetId, objectId],
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
    });

    it("document_binding allows same asset bound to different object types", async () => {
      const objectId = "00000000-0000-0000-0000-000000000002";
      await expect(
        client.query(
          `INSERT INTO cannabis.document_binding
             (document_asset_id, object_type, object_id, binding_role)
           VALUES ($1, 'harvest_lot', $2, 'coa')
           RETURNING id`,
          [assetId, objectId],
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
    });

    it("document_binding allows same object bound with different roles", async () => {
      const objectId = "00000000-0000-0000-0000-000000000003";
      await client.query(
        `INSERT INTO cannabis.document_binding
           (document_asset_id, object_type, object_id, binding_role)
         VALUES ($1, 'transfer', $2, 'manifest')`,
        [assetId, objectId],
      );
      await expect(
        client.query(
          `INSERT INTO cannabis.document_binding
             (document_asset_id, object_type, object_id, binding_role)
           VALUES ($1, 'transfer', $2, 'sop')
           RETURNING id`,
          [assetId, objectId],
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
    });

    it("document_binding rejects duplicate (asset, object_type, object_id, binding_role)", async () => {
      const objectId = "00000000-0000-0000-0000-000000000004";
      await client.query(
        `INSERT INTO cannabis.document_binding
           (document_asset_id, object_type, object_id, binding_role)
         VALUES ($1, 'sale', $2, 'receipt')`,
        [assetId, objectId],
      );
      await expect(
        client.query(
          `INSERT INTO cannabis.document_binding
             (document_asset_id, object_type, object_id, binding_role)
           VALUES ($1, 'sale', $2, 'receipt')`,
          [assetId, objectId],
        ),
      ).rejects.toThrow();
    });

    it("document_binding metadata column accepts policy-shaped JSON", async () => {
      const objectId = "00000000-0000-0000-0000-000000000005";
      const policy = JSON.stringify({ visibility: "internal", expires_at: null });
      await expect(
        client.query(
          `INSERT INTO cannabis.document_binding
             (document_asset_id, object_type, object_id, binding_role, metadata)
           VALUES ($1, 'license', $2, 'license_copy', $3)
           RETURNING metadata`,
          [assetId, objectId, policy],
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
    });
  });
});
