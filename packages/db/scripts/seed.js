"use strict";
const path = require("node:path");
const fs = require("node:fs");
const { Client } = require("pg");

// ---------------------------------------------------------------------------
// Env resolution — same pattern as run.js / reset.js
// ---------------------------------------------------------------------------
function loadEnv() {
  if (process.env["DATABASE_URL"]) return;
  const infraEnv = path.resolve(__dirname, "../../../infra/.env");
  if (fs.existsSync(infraEnv)) {
    require("dotenv").config({ path: infraEnv });
  }
  if (!process.env["DATABASE_URL"]) {
    const { POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB } = process.env;
    if (POSTGRES_USER && POSTGRES_PASSWORD && POSTGRES_DB) {
      process.env["DATABASE_URL"] =
        `postgresql://${POSTGRES_USER}:${encodeURIComponent(POSTGRES_PASSWORD)}@localhost:5432/${POSTGRES_DB}`;
    }
  }
}

// ---------------------------------------------------------------------------
// Deterministic seed IDs
// Fixed UUIDs — re-running the seed always targets these exact rows.
// ---------------------------------------------------------------------------
const S = {
  tenant: "10000000-0000-0000-0000-000000000001",
  organization: "10000000-0000-0000-0000-000000000002",
  jurisdiction_ny: "10000000-0000-0000-0000-000000000003",
  facility: "10000000-0000-0000-0000-000000000004",
  license: "10000000-0000-0000-0000-000000000005",
  facility_license: "10000000-0000-0000-0000-000000000006",
  regulatory_system_metrc: "10000000-0000-0000-0000-000000000007",
  facility_reg_binding: "10000000-0000-0000-0000-000000000008",
  // inventory
  location_grow_room_a: "10000000-0000-0000-0000-000000000009",
  location_vault: "10000000-0000-0000-0000-000000000010",
  strain_blue_dream: "10000000-0000-0000-0000-000000000011",
  product_def_flower_bulk: "10000000-0000-0000-0000-000000000012",
  product_def_flower_jar: "10000000-0000-0000-0000-000000000013",
  harvest_lot: "10000000-0000-0000-0000-000000000014",
  material_lot: "10000000-0000-0000-0000-000000000015",
  package: "10000000-0000-0000-0000-000000000016",
  employee: "10000000-0000-0000-0000-000000000017",
  device_terminal: "10000000-0000-0000-0000-000000000018",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function log(msg) {
  process.stdout.write(msg + "\n");
}

// Insert a row keyed by its deterministic id.
// Skips silently if the row already exists.
async function ensureById(client, table, data) {
  const { id } = data;
  const { rows: existing } = await client.query(
    `SELECT 1 FROM cannabis.${table} WHERE id = $1`,
    [id],
  );
  if (existing.length > 0) {
    log(`  [exists]  cannabis.${table}  id=${id}`);
    return id;
  }
  const cols = Object.keys(data);
  const vals = Object.values(data);
  const ph = vals.map((_, i) => `$${i + 1}`).join(", ");
  await client.query(
    `INSERT INTO cannabis.${table} (${cols.join(", ")}) VALUES (${ph})`,
    vals,
  );
  log(`  [created] cannabis.${table}  id=${id}`);
  return id;
}

// Insert a row keyed by its 'code' natural unique column.
// If the code already exists (possibly with a different id), returns that
// pre-existing id so downstream entities link to the correct row.
async function ensureByCode(client, table, seedId, code, extraData) {
  const { rows: existing } = await client.query(
    `SELECT id FROM cannabis.${table} WHERE code = $1`,
    [code],
  );
  if (existing.length > 0) {
    const actualId = existing[0].id;
    log(`  [exists]  cannabis.${table}  code=${code}  id=${actualId}`);
    return actualId;
  }
  const data = { id: seedId, code, ...extraData };
  const cols = Object.keys(data);
  const vals = Object.values(data);
  const ph = vals.map((_, i) => `$${i + 1}`).join(", ");
  await client.query(
    `INSERT INTO cannabis.${table} (${cols.join(", ")}) VALUES (${ph})`,
    vals,
  );
  log(`  [created] cannabis.${table}  code=${code}  id=${seedId}`);
  return seedId;
}

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------
async function runSeed(client) {
  log("[seed] Starting baseline seed…");

  // 1. Tenant
  await ensureById(client, "tenant", {
    id: S.tenant,
    name: "Canopy Demo LLC",
    deployment_mode: "saas",
    status: "active",
  });

  // 2. Organization
  await ensureById(client, "organization", {
    id: S.organization,
    tenant_id: S.tenant,
    legal_name: "Canopy Demo Operations LLC",
    dba_name: "Canopy Demo",
    status: "active",
  });

  // 3. Jurisdiction — NY
  // unique on: code
  const jurisdictionId = await ensureByCode(
    client,
    "jurisdiction",
    S.jurisdiction_ny,
    "NY",
    { name: "New York", country_code: "US", status: "active" },
  );

  // 4. Facility
  await ensureById(client, "facility", {
    id: S.facility,
    organization_id: S.organization,
    jurisdiction_id: jurisdictionId,
    name: "Demo Cultivation Facility",
    facility_type: "cultivation",
    timezone: "America/New_York",
    status: "active",
  });

  // 5. License
  // unique on: (jurisdiction_id, license_number)
  const LICENSE_NUMBER = "NY-CDTA-0000001";
  const { rows: existingLicense } = await client.query(
    `SELECT id FROM cannabis.license
     WHERE jurisdiction_id = $1 AND license_number = $2`,
    [jurisdictionId, LICENSE_NUMBER],
  );
  let licenseId;
  if (existingLicense.length > 0) {
    licenseId = existingLicense[0].id;
    log(
      `  [exists]  cannabis.license  license_number=${LICENSE_NUMBER}  id=${licenseId}`,
    );
  } else {
    await client.query(
      `INSERT INTO cannabis.license
         (id, organization_id, jurisdiction_id, license_number, license_type,
          issuer_name, issued_on, expires_on, status)
       VALUES ($1, $2, $3, $4, 'adult_use_cultivation',
               'NY Office of Cannabis Management', '2024-01-01', '2026-12-31', 'active')`,
      [S.license, S.organization, jurisdictionId, LICENSE_NUMBER],
    );
    licenseId = S.license;
    log(
      `  [created] cannabis.license  license_number=${LICENSE_NUMBER}  id=${licenseId}`,
    );
  }

  // 6. Facility-license binding
  // unique on: (facility_id, license_id, business_function)
  const { rows: existingFl } = await client.query(
    `SELECT 1 FROM cannabis.facility_license
     WHERE facility_id = $1 AND license_id = $2 AND business_function = 'cultivation'`,
    [S.facility, licenseId],
  );
  if (existingFl.length > 0) {
    log(
      `  [exists]  cannabis.facility_license  facility=${S.facility}  license=${licenseId}`,
    );
  } else {
    await client.query(
      `INSERT INTO cannabis.facility_license
         (id, facility_id, license_id, business_function, primary_flag)
       VALUES ($1, $2, $3, 'cultivation', true)`,
      [S.facility_license, S.facility, licenseId],
    );
    log(`  [created] cannabis.facility_license  id=${S.facility_license}`);
  }

  // 7. Regulatory system — metrc
  // unique on: code
  const regulatorySystemId = await ensureByCode(
    client,
    "regulatory_system",
    S.regulatory_system_metrc,
    "metrc",
    { name: "Metrc", status: "active" },
  );

  // 8. Facility regulator binding
  // partial unique index: (facility_id, regulatory_system_id, environment) WHERE active = true
  const { rows: existingBinding } = await client.query(
    `SELECT id FROM cannabis.facility_regulator_binding
     WHERE facility_id = $1 AND regulatory_system_id = $2
       AND environment = 'sandbox' AND active = true`,
    [S.facility, regulatorySystemId],
  );
  if (existingBinding.length > 0) {
    const bId = existingBinding[0].id;
    log(`  [exists]  cannabis.facility_regulator_binding  id=${bId}`);
  } else {
    await client.query(
      `INSERT INTO cannabis.facility_regulator_binding
         (id, facility_id, regulatory_system_id, environment,
          facility_external_id, policy_pack, status, active)
       VALUES ($1, $2, $3, 'sandbox', 'DEMO-NY-FACILITY-001', 'ny-metrc-v1', 'active', true)`,
      [S.facility_reg_binding, S.facility, regulatorySystemId],
    );
    log(`  [created] cannabis.facility_regulator_binding  id=${S.facility_reg_binding}`);
  }

  log("[seed] Baseline seed complete.");

  // =========================================================================
  // Inventory seed — Story 1.3.2
  // NY cultivation facility: locations → strain → product defs →
  //   harvest lot → material lot → package → employee → device terminal
  // =========================================================================
  log("[seed] Starting inventory seed…");

  // 9. Locations
  await ensureById(client, "location", {
    id: S.location_grow_room_a,
    facility_id: S.facility,
    code: "LOC-GR-A",
    name: "Grow Room A",
    location_type: "canopy",
    active: true,
  });

  await ensureById(client, "location", {
    id: S.location_vault,
    facility_id: S.facility,
    code: "LOC-VAULT-01",
    name: "Secure Vault 01",
    location_type: "vault",
    active: true,
  });

  // 10. Strain
  await ensureById(client, "strain", {
    id: S.strain_blue_dream,
    facility_id: S.facility,
    name: "Blue Dream",
    cultivar_type: "hybrid",
    breeder: "Canopy Genetics",
    lineage_text: "Blueberry × Haze",
    active: true,
  });

  // 11. Product definitions
  await ensureById(client, "product_definition", {
    id: S.product_def_flower_bulk,
    facility_id: S.facility,
    sku: "FLOUR-BD-BULK",
    name: "Blue Dream Flower – Bulk",
    category: "flower",
    subcategory: "bulk",
    default_uom: "g",
    retail_ready: false,
    active: true,
  });

  await ensureById(client, "product_definition", {
    id: S.product_def_flower_jar,
    facility_id: S.facility,
    sku: "FLOUR-BD-3G5",
    name: "Blue Dream 3.5g Jar",
    category: "flower",
    subcategory: "pre-packaged",
    default_uom: "ea",
    retail_ready: true,
    net_weight_g: "3.500000",
    thc_mg: "87.500",
    cbd_mg: "3.500",
    active: true,
  });

  // 12. Harvest lot
  await ensureById(client, "harvest_lot", {
    id: S.harvest_lot,
    facility_id: S.facility,
    strain_id: S.strain_blue_dream,
    location_id: S.location_grow_room_a,
    harvest_code: "HRV-2025-BD-001",
    harvested_on: "2025-06-15",
    wet_weight: "5000.000000",
    dry_weight: "1200.000000",
    status: "closed",
  });

  // 13. Material lot (biomass from that harvest)
  await ensureById(client, "material_lot", {
    id: S.material_lot,
    tenant_id: S.tenant,
    organization_id: S.organization,
    facility_id: S.facility,
    location_id: S.location_vault,
    product_definition_id: S.product_def_flower_bulk,
    source_harvest_lot_id: S.harvest_lot,
    lot_code: "MAT-2025-BD-001",
    lot_kind: "biomass",
    current_qty: "1200.000000",
    reserved_qty: "3.500000",
    uom: "g",
    status: "active",
    produced_at: "2025-06-22T00:00:00Z",
  });

  // 14. Package (single retail jar pulled from material lot)
  await ensureById(client, "package", {
    id: S.package,
    tenant_id: S.tenant,
    organization_id: S.organization,
    facility_id: S.facility,
    material_lot_id: S.material_lot,
    product_definition_id: S.product_def_flower_jar,
    location_id: S.location_vault,
    package_code: "PKG-2025-BD-0001",
    package_kind: "flower_jar",
    current_qty: "1.000000",
    reserved_qty: "0.000000",
    uom: "ea",
    packaged_at: "2025-06-25T00:00:00Z",
    package_status: "active",
    retail_ready: true,
    finished_goods: true,
  });

  // 15. Employee
  await ensureById(client, "employee", {
    id: S.employee,
    facility_id: S.facility,
    employee_no: "EMP-001",
    full_name: "Jordan Rivera",
    email: "j.rivera@canopydemo.com",
    status: "active",
  });

  // 16. Device terminal
  await ensureById(client, "device_terminal", {
    id: S.device_terminal,
    facility_id: S.facility,
    device_code: "TERM-POS-001",
    device_type: "pos",
    hostname: "ct-pos-01.local",
    status: "active",
  });

  log("[seed] Inventory seed complete.");
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
loadEnv();

if (!process.env["DATABASE_URL"]) {
  process.stderr.write(
    "Error: DATABASE_URL is not set and cannot be derived from POSTGRES_* vars.\n" +
      "Copy infra/.env.example to infra/.env and fill in the values.\n",
  );
  process.exit(1);
}

async function main() {
  const client = new Client({ connectionString: process.env["DATABASE_URL"] });
  await client.connect();
  try {
    await client.query("BEGIN");
    await runSeed(client);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  process.stderr.write(`[seed] Error: ${err.message}\n`);
  process.exit(1);
});
