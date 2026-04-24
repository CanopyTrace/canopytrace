-- Up Migration
-- Baseline schema for CanopyTrace (canonical + MVP additions).
--
-- Canonical tables: tenant/org/facility governance, regulatory bindings,
-- cultivation-to-retail operational chain, outbox/sync/audit.
--
-- MVP additions (Architecture Brief §6):
--   Identity & Access   — app_user, auth_identity, role_definition, role_binding
--   Module enablement   — module_definition, module_setting
--   Document storage    — document_asset, document_binding
--   Compliance workflow — compliance_exception, compliance_task
--   Policy pack catalog — policy_pack_registry

set search_path = cannabis, public;

-- ---------------------------------------------------------------------------
-- Extensions and schema
-- ---------------------------------------------------------------------------

create extension if not exists pgcrypto;
create extension if not exists citext;
create schema if not exists cannabis;

-- ---------------------------------------------------------------------------
-- Helper: updated_at trigger function
-- ---------------------------------------------------------------------------

create or replace function cannabis.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Root / governance
-- ---------------------------------------------------------------------------

create table if not exists cannabis.tenant (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  deployment_mode     text not null default 'saas', -- saas, self_hosted, byoi
  status              text not null default 'active',
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table if not exists cannabis.organization (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references cannabis.tenant(id) on delete cascade,
  legal_name          text not null,
  dba_name            text,
  status              text not null default 'active',
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table if not exists cannabis.jurisdiction (
  id                  uuid primary key default gen_random_uuid(),
  code                text not null unique, -- NY, FL, NM, etc.
  name                text not null,
  country_code        text not null default 'US',
  status              text not null default 'active',
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table if not exists cannabis.facility (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references cannabis.organization(id) on delete cascade,
  jurisdiction_id     uuid not null references cannabis.jurisdiction(id),
  name                text not null,
  facility_type       text not null, -- cultivation, processing, retail, distribution, lab, mixed
  timezone            text not null default 'UTC',
  status              text not null default 'active',
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table if not exists cannabis.license (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references cannabis.organization(id) on delete cascade,
  jurisdiction_id     uuid not null references cannabis.jurisdiction(id),
  license_number      text not null,
  license_type        text not null,
  issuer_name         text,
  issued_on           date,
  expires_on          date,
  status              text not null default 'active',
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (jurisdiction_id, license_number)
);

create table if not exists cannabis.facility_license (
  id                  uuid primary key default gen_random_uuid(),
  facility_id         uuid not null references cannabis.facility(id) on delete cascade,
  license_id          uuid not null references cannabis.license(id) on delete cascade,
  business_function   text not null, -- cultivation, processing, retail, distribution
  primary_flag        boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (facility_id, license_id, business_function)
);

create table if not exists cannabis.location (
  id                  uuid primary key default gen_random_uuid(),
  facility_id         uuid not null references cannabis.facility(id) on delete cascade,
  parent_location_id  uuid references cannabis.location(id) on delete set null,
  code                text not null,
  name                text not null,
  location_type       text not null, -- room, shelf, canopy, vault, freezer, sales_floor, etc.
  path                text,
  active              boolean not null default true,
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (facility_id, code)
);

create table if not exists cannabis.employee (
  id                  uuid primary key default gen_random_uuid(),
  facility_id         uuid not null references cannabis.facility(id) on delete cascade,
  employee_no         text not null,
  external_ref        text,
  full_name           text not null,
  email               citext,
  status              text not null default 'active',
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (facility_id, employee_no)
);

create table if not exists cannabis.device_terminal (
  id                  uuid primary key default gen_random_uuid(),
  facility_id         uuid not null references cannabis.facility(id) on delete cascade,
  device_code         text not null,
  device_type         text not null, -- pos, kiosk, handheld, printer_station, scale_station
  hostname            text,
  status              text not null default 'active',
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (facility_id, device_code)
);

-- ---------------------------------------------------------------------------
-- Regulatory routing / external crosswalk
-- ---------------------------------------------------------------------------

create table if not exists cannabis.regulatory_system (
  id                  uuid primary key default gen_random_uuid(),
  code                text not null unique, -- metrc, biotrack, etc.
  name                text not null,
  status              text not null default 'active',
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table if not exists cannabis.facility_regulator_binding (
  id                  uuid primary key default gen_random_uuid(),
  facility_id         uuid not null references cannabis.facility(id) on delete cascade,
  regulatory_system_id uuid not null references cannabis.regulatory_system(id),
  environment         text not null, -- sandbox, production
  facility_external_id text,
  adapter_route       text,
  policy_pack         text not null, -- e.g. ny-metrc-v1
  status              text not null default 'active',
  active              boolean not null default true,
  last_synced_at      timestamptz,
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table if not exists cannabis.external_identifier (
  id                            uuid primary key default gen_random_uuid(),
  facility_regulator_binding_id uuid not null references cannabis.facility_regulator_binding(id) on delete cascade,
  object_type                   text not null, -- plant, package, material_lot, transfer, sale, etc.
  object_id                     uuid not null,
  external_id                   text not null,
  external_version              text,
  external_payload              jsonb not null default '{}'::jsonb,
  last_seen_at                  timestamptz,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now(),
  unique (facility_regulator_binding_id, object_type, object_id),
  unique (facility_regulator_binding_id, object_type, external_id)
);

-- ---------------------------------------------------------------------------
-- Catalog / genetics
-- ---------------------------------------------------------------------------

create table if not exists cannabis.strain (
  id                  uuid primary key default gen_random_uuid(),
  facility_id         uuid not null references cannabis.facility(id) on delete cascade,
  name                text not null,
  cultivar_type       text,
  breeder             text,
  lineage_text        text,
  active              boolean not null default true,
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (facility_id, name)
);

create table if not exists cannabis.product_definition (
  id                  uuid primary key default gen_random_uuid(),
  facility_id         uuid not null references cannabis.facility(id) on delete cascade,
  sku                 text not null,
  name                text not null,
  category            text not null,
  subcategory         text,
  default_uom         text not null,
  retail_ready        boolean not null default false,
  net_weight_g        numeric(18,6),
  thc_mg              numeric(18,3),
  cbd_mg              numeric(18,3),
  active              boolean not null default true,
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (facility_id, sku)
);

-- ---------------------------------------------------------------------------
-- Cultivation
-- ---------------------------------------------------------------------------

create table if not exists cannabis.plant_batch (
  id                  uuid primary key default gen_random_uuid(),
  facility_id         uuid not null references cannabis.facility(id) on delete cascade,
  strain_id           uuid references cannabis.strain(id) on delete set null,
  batch_code          text not null,
  source_type         text,
  plant_count         integer not null default 0 check (plant_count >= 0),
  stage               text not null, -- clone, seedling, veg, immature
  started_on          date,
  status              text not null default 'active',
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (facility_id, batch_code)
);

create table if not exists cannabis.plant (
  id                  uuid primary key default gen_random_uuid(),
  facility_id         uuid not null references cannabis.facility(id) on delete cascade,
  plant_batch_id      uuid references cannabis.plant_batch(id) on delete set null,
  strain_id           uuid references cannabis.strain(id) on delete set null,
  current_location_id uuid references cannabis.location(id) on delete set null,
  plant_tag           text not null,
  growth_phase        text not null,
  status              text not null default 'active',
  planted_on          date,
  harvested_on        date,
  destroyed_on        date,
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (facility_id, plant_tag)
);

create table if not exists cannabis.harvest_lot (
  id                  uuid primary key default gen_random_uuid(),
  facility_id         uuid not null references cannabis.facility(id) on delete cascade,
  strain_id           uuid references cannabis.strain(id) on delete set null,
  location_id         uuid references cannabis.location(id) on delete set null,
  harvest_code        text not null,
  harvested_on        date not null,
  wet_weight          numeric(18,6),
  dry_weight          numeric(18,6),
  status              text not null default 'open',
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (facility_id, harvest_code)
);

create table if not exists cannabis.harvest_lot_plant (
  id              uuid primary key default gen_random_uuid(),
  harvest_lot_id  uuid not null references cannabis.harvest_lot(id) on delete cascade,
  plant_id        uuid not null references cannabis.plant(id) on delete cascade,
  created_at      timestamptz not null default now(),
  unique (harvest_lot_id, plant_id)
);

-- ---------------------------------------------------------------------------
-- Inventory / manufacturing
-- ---------------------------------------------------------------------------

create table if not exists cannabis.material_lot (
  id                    uuid primary key default gen_random_uuid(),
  facility_id           uuid not null references cannabis.facility(id) on delete cascade,
  location_id           uuid references cannabis.location(id) on delete set null,
  product_definition_id uuid references cannabis.product_definition(id) on delete set null,
  source_harvest_lot_id uuid references cannabis.harvest_lot(id) on delete set null,
  lot_code              text not null,
  lot_kind              text not null, -- biomass, extract, wip, bulk_finished, waste, etc.
  current_qty           numeric(18,6) not null default 0 check (current_qty >= 0),
  reserved_qty          numeric(18,6) not null default 0 check (reserved_qty >= 0),
  uom                   text not null,
  status                text not null default 'active',
  hold_reason           text,
  produced_at           timestamptz,
  expires_at            timestamptz,
  metadata              jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (facility_id, lot_code),
  check (reserved_qty <= current_qty)
);

create table if not exists cannabis.process_run (
  id            uuid primary key default gen_random_uuid(),
  facility_id   uuid not null references cannabis.facility(id) on delete cascade,
  location_id   uuid references cannabis.location(id) on delete set null,
  run_code      text not null,
  run_type      text not null, -- extraction, infusion, blending, packaging, remediation, rework
  started_at    timestamptz,
  completed_at  timestamptz,
  status        text not null default 'planned',
  notes         text,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (facility_id, run_code),
  check (completed_at is null or started_at is null or completed_at >= started_at)
);

create table if not exists cannabis.process_run_input (
  id              uuid primary key default gen_random_uuid(),
  process_run_id  uuid not null references cannabis.process_run(id) on delete cascade,
  material_lot_id uuid not null references cannabis.material_lot(id) on delete restrict,
  qty_consumed    numeric(18,6) not null check (qty_consumed > 0),
  uom             text not null,
  created_at      timestamptz not null default now(),
  unique (process_run_id, material_lot_id)
);

create table if not exists cannabis.process_run_output (
  id              uuid primary key default gen_random_uuid(),
  process_run_id  uuid not null references cannabis.process_run(id) on delete cascade,
  material_lot_id uuid not null references cannabis.material_lot(id) on delete restrict,
  qty_produced    numeric(18,6) not null check (qty_produced > 0),
  uom             text not null,
  created_at      timestamptz not null default now(),
  unique (process_run_id, material_lot_id)
);

create table if not exists cannabis.package (
  id                    uuid primary key default gen_random_uuid(),
  facility_id           uuid not null references cannabis.facility(id) on delete cascade,
  material_lot_id       uuid not null references cannabis.material_lot(id) on delete restrict,
  product_definition_id uuid references cannabis.product_definition(id) on delete set null,
  location_id           uuid references cannabis.location(id) on delete set null,
  package_code          text not null,
  package_kind          text,
  current_qty           numeric(18,6) not null default 0 check (current_qty >= 0),
  reserved_qty          numeric(18,6) not null default 0 check (reserved_qty >= 0),
  uom                   text not null,
  packaged_at           timestamptz,
  expires_at            timestamptz,
  package_status        text not null default 'active',
  retail_ready          boolean not null default false,
  finished_goods        boolean not null default false,
  metadata              jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (facility_id, package_code),
  check (reserved_qty <= current_qty)
);

create table if not exists cannabis.package_unit (
  id          uuid primary key default gen_random_uuid(),
  package_id  uuid not null references cannabis.package(id) on delete cascade,
  unit_code   text not null,
  serial_or_qr text,
  status      text not null default 'available',
  sold_at     timestamptz,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (package_id, unit_code),
  unique (serial_or_qr)
);

create table if not exists cannabis.inventory_ledger_entry (
  id                  uuid primary key default gen_random_uuid(),
  facility_id         uuid not null references cannabis.facility(id) on delete cascade,
  material_lot_id     uuid references cannabis.material_lot(id) on delete restrict,
  package_id          uuid references cannabis.package(id) on delete restrict,
  from_location_id    uuid references cannabis.location(id) on delete set null,
  to_location_id      uuid references cannabis.location(id) on delete set null,
  actor_employee_id   uuid references cannabis.employee(id) on delete set null,
  event_type          text not null, -- create, move, adjust, consume, produce, package, split, merge, hold, release, waste, sale
  qty_delta           numeric(18,6) not null check (qty_delta <> 0),
  uom                 text not null,
  reason_code         text,
  reference_type      text, -- process_run, transfer, sale, manual_adjustment, sync_repair
  reference_id        uuid,
  notes               text,
  occurred_at         timestamptz not null default now(),
  metadata            jsonb not null default '{}'::jsonb,
  check (
    (material_lot_id is not null and package_id is null)
    or
    (material_lot_id is null and package_id is not null)
  )
);

-- ---------------------------------------------------------------------------
-- Quality / lab
-- ---------------------------------------------------------------------------

create table if not exists cannabis.lab_sample (
  id                       uuid primary key default gen_random_uuid(),
  facility_id              uuid not null references cannabis.facility(id) on delete cascade,
  material_lot_id          uuid references cannabis.material_lot(id) on delete restrict,
  package_id               uuid references cannabis.package(id) on delete restrict,
  sampled_by_employee_id   uuid references cannabis.employee(id) on delete set null,
  sample_code              text not null,
  sampled_on               date not null,
  lab_name                 text,
  status                   text not null default 'collected',
  notes                    text,
  metadata                 jsonb not null default '{}'::jsonb,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (facility_id, sample_code),
  check (
    (material_lot_id is not null and package_id is null)
    or
    (material_lot_id is null and package_id is not null)
  )
);

create table if not exists cannabis.lab_result (
  id              uuid primary key default gen_random_uuid(),
  lab_sample_id   uuid not null references cannabis.lab_sample(id) on delete cascade,
  test_type       text not null,
  result_status   text not null, -- passed, failed, pending, partial
  passed          boolean,
  reported_at     timestamptz,
  analytes        jsonb not null default '{}'::jsonb,
  summary         jsonb not null default '{}'::jsonb,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists cannabis.coa_document (
  id              uuid primary key default gen_random_uuid(),
  lab_result_id   uuid not null unique references cannabis.lab_result(id) on delete cascade,
  document_uri    text not null,
  file_name       text,
  sha256          text,
  uploaded_at     timestamptz not null default now(),
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Transfers / retail
-- ---------------------------------------------------------------------------

create table if not exists cannabis.transfer (
  id                      uuid primary key default gen_random_uuid(),
  facility_id             uuid not null references cannabis.facility(id) on delete cascade,
  from_license_id         uuid references cannabis.license(id) on delete set null,
  to_license_id           uuid references cannabis.license(id) on delete set null,
  transfer_code           text not null,
  direction               text not null, -- outbound, inbound
  counterparty_name       text,
  manifest_no             text,
  scheduled_departure_at  timestamptz,
  actual_departure_at     timestamptz,
  received_at             timestamptz,
  vehicle_identifier      text,
  driver_name             text,
  status                  text not null default 'draft',
  notes                   text,
  metadata                jsonb not null default '{}'::jsonb,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (facility_id, transfer_code),
  check (direction in ('outbound', 'inbound')),
  check (
    received_at is null
    or actual_departure_at is null
    or received_at >= actual_departure_at
  )
);

create table if not exists cannabis.transfer_line (
  id           uuid primary key default gen_random_uuid(),
  transfer_id  uuid not null references cannabis.transfer(id) on delete cascade,
  package_id   uuid not null references cannabis.package(id) on delete restrict,
  qty          numeric(18,6) not null check (qty > 0),
  uom          text not null,
  received_qty numeric(18,6) check (received_qty is null or received_qty >= 0),
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (transfer_id, package_id)
);

create table if not exists cannabis.customer (
  id              uuid primary key default gen_random_uuid(),
  facility_id     uuid not null references cannabis.facility(id) on delete cascade,
  customer_type   text not null default 'consumer', -- consumer, patient, wholesale
  external_ref    text,
  full_name       text,
  status          text not null default 'active',
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (facility_id, external_ref)
);

create table if not exists cannabis.sale (
  id                  uuid primary key default gen_random_uuid(),
  facility_id         uuid not null references cannabis.facility(id) on delete cascade,
  customer_id         uuid references cannabis.customer(id) on delete set null,
  employee_id         uuid not null references cannabis.employee(id) on delete restrict,
  device_terminal_id  uuid not null references cannabis.device_terminal(id) on delete restrict,
  receipt_no          text not null,
  sold_at             timestamptz not null default now(),
  subtotal_amount     numeric(14,2) not null default 0,
  discount_amount     numeric(14,2) not null default 0,
  tax_amount          numeric(14,2) not null default 0,
  total_amount        numeric(14,2) not null default 0,
  payment_status      text not null default 'unpaid',
  status              text not null default 'completed',
  notes               text,
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (facility_id, receipt_no)
);

create table if not exists cannabis.sale_line (
  id                    uuid primary key default gen_random_uuid(),
  sale_id               uuid not null references cannabis.sale(id) on delete cascade,
  line_no               integer not null check (line_no > 0),
  package_id            uuid references cannabis.package(id) on delete restrict,
  package_unit_id       uuid references cannabis.package_unit(id) on delete restrict,
  product_definition_id uuid not null references cannabis.product_definition(id) on delete restrict,
  qty                   numeric(18,6) not null check (qty > 0),
  unit_price            numeric(14,2) not null default 0,
  line_discount         numeric(14,2) not null default 0,
  line_tax              numeric(14,2) not null default 0,
  line_total            numeric(14,2) not null default 0,
  metadata              jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (sale_id, line_no),
  check (
    (package_id is not null and package_unit_id is null)
    or
    (package_id is null and package_unit_id is not null)
  )
);

create table if not exists cannabis.payment (
  id              uuid primary key default gen_random_uuid(),
  sale_id         uuid not null references cannabis.sale(id) on delete cascade,
  payment_method  text not null, -- cash, debit, ach, etc.
  amount          numeric(14,2) not null check (amount > 0),
  tendered_amount numeric(14,2) check (tendered_amount is null or tendered_amount >= amount),
  reference_no    text,
  status          text not null default 'captured',
  paid_at         timestamptz not null default now(),
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Outbox / sync / audit
-- ---------------------------------------------------------------------------

create table if not exists cannabis.outbox_event (
  id              uuid primary key default gen_random_uuid(),
  facility_id     uuid not null references cannabis.facility(id) on delete cascade,
  object_type     text not null,
  object_id       uuid not null,
  event_type      text not null,
  dedupe_key      text,
  payload         jsonb not null,
  status          text not null default 'pending', -- pending, processing, sent, failed, dead_letter
  attempt_count   integer not null default 0 check (attempt_count >= 0),
  last_error      text,
  available_at    timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists cannabis.regulatory_sync_job (
  id                            uuid primary key default gen_random_uuid(),
  facility_id                   uuid not null references cannabis.facility(id) on delete cascade,
  facility_regulator_binding_id uuid not null references cannabis.facility_regulator_binding(id) on delete cascade,
  object_type                   text not null,
  object_id                     uuid not null,
  operation                     text not null, -- create, update, delete, submit, receive, reconcile
  status                        text not null default 'queued', -- queued, processing, succeeded, failed, dead_letter
  attempt_count                 integer not null default 0 check (attempt_count >= 0),
  last_error                    text,
  queued_at                     timestamptz not null default now(),
  started_at                    timestamptz,
  completed_at                  timestamptz,
  metadata                      jsonb not null default '{}'::jsonb,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now(),
  check (
    completed_at is null
    or started_at is null
    or completed_at >= started_at
  )
);

create table if not exists cannabis.regulatory_sync_event (
  id                       uuid primary key default gen_random_uuid(),
  regulatory_sync_job_id   uuid not null references cannabis.regulatory_sync_job(id) on delete cascade,
  attempt_no               integer not null check (attempt_no > 0),
  http_status              integer,
  outcome                  text not null, -- success, retryable_error, permanent_error
  duration_ms              integer check (duration_ms is null or duration_ms >= 0),
  request_payload          jsonb not null default '{}'::jsonb,
  response_payload         jsonb not null default '{}'::jsonb,
  occurred_at              timestamptz not null default now(),
  unique (regulatory_sync_job_id, attempt_no)
);

create table if not exists cannabis.audit_event (
  id                  uuid primary key default gen_random_uuid(),
  facility_id         uuid not null references cannabis.facility(id) on delete cascade,
  employee_id         uuid references cannabis.employee(id) on delete set null,
  device_terminal_id  uuid references cannabis.device_terminal(id) on delete set null,
  object_type         text not null,
  object_id           uuid not null,
  action              text not null,
  before_state        jsonb not null default '{}'::jsonb,
  after_state         jsonb not null default '{}'::jsonb,
  source              text, -- ui, api, import, sync_repair
  ip_address          inet,
  occurred_at         timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- MVP: Identity & Access
-- ---------------------------------------------------------------------------

create table if not exists cannabis.app_user (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references cannabis.tenant(id) on delete cascade,
  email         citext not null,
  full_name     text not null,
  status        text not null default 'active',
  mfa_enabled   boolean not null default false,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (tenant_id, email)
);

create table if not exists cannabis.auth_identity (
  id                uuid primary key default gen_random_uuid(),
  app_user_id       uuid not null references cannabis.app_user(id) on delete cascade,
  provider          text not null,   -- local, oidc
  provider_sub      text,            -- OIDC subject claim
  password_hash     text,            -- bcrypt hash for local auth
  totp_secret_enc   text,            -- symmetrically encrypted TOTP secret
  last_login_at     timestamptz,
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (provider, provider_sub)
);

create table if not exists cannabis.role_definition (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references cannabis.tenant(id) on delete cascade,
  name          text not null,
  scope         text not null default 'facility', -- tenant, organization, facility
  permissions   jsonb not null default '[]'::jsonb,
  system_role   boolean not null default false,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (tenant_id, name)
);

-- role_binding has no updated_at — bindings are immutable; revoke by deleting.
create table if not exists cannabis.role_binding (
  id                  uuid primary key default gen_random_uuid(),
  app_user_id         uuid not null references cannabis.app_user(id) on delete cascade,
  role_definition_id  uuid not null references cannabis.role_definition(id) on delete cascade,
  organization_id     uuid references cannabis.organization(id) on delete cascade,
  facility_id         uuid references cannabis.facility(id) on delete cascade,
  granted_by_user_id  uuid references cannabis.app_user(id) on delete set null,
  created_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- MVP: Module enablement
-- ---------------------------------------------------------------------------

create table if not exists cannabis.module_definition (
  id                        uuid primary key default gen_random_uuid(),
  code                      text not null unique, -- cultivation, manufacturing, retail, lab, etc.
  name                      text not null,
  compatible_facility_types text[] not null default '{}',
  metadata                  jsonb not null default '{}'::jsonb,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create table if not exists cannabis.module_setting (
  id                    uuid primary key default gen_random_uuid(),
  module_definition_id  uuid not null references cannabis.module_definition(id) on delete cascade,
  tenant_id             uuid references cannabis.tenant(id) on delete cascade,
  organization_id       uuid references cannabis.organization(id) on delete cascade,
  facility_id           uuid references cannabis.facility(id) on delete cascade,
  enabled               boolean not null default false,
  config                jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check (
    (tenant_id is not null)::int +
    (organization_id is not null)::int +
    (facility_id is not null)::int = 1
  )
);

-- ---------------------------------------------------------------------------
-- MVP: Document / object storage abstraction
-- ---------------------------------------------------------------------------

create table if not exists cannabis.document_asset (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references cannabis.tenant(id) on delete cascade,
  facility_id           uuid references cannabis.facility(id) on delete set null,
  asset_class           text not null,  -- evidence, export, user_upload, system_artifact
  storage_key           text not null,  -- opaque key in object store
  bucket                text not null,
  file_name             text,
  content_type          text,
  size_bytes            bigint check (size_bytes is null or size_bytes >= 0),
  sha256                text,
  retention_class       text not null default 'standard',
  uploaded_by_user_id   uuid references cannabis.app_user(id) on delete set null,
  metadata              jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (bucket, storage_key)
);

-- document_binding has no updated_at — links are immutable once created.
create table if not exists cannabis.document_binding (
  id                    uuid primary key default gen_random_uuid(),
  document_asset_id     uuid not null references cannabis.document_asset(id) on delete cascade,
  object_type           text not null,
  object_id             uuid not null,
  binding_role          text not null, -- coa, manifest, license_copy, receipt, sop, etc.
  created_by_user_id    uuid references cannabis.app_user(id) on delete set null,
  created_at            timestamptz not null default now(),
  unique (document_asset_id, object_type, object_id, binding_role)
);

-- ---------------------------------------------------------------------------
-- MVP: Compliance workflow
-- ---------------------------------------------------------------------------

create table if not exists cannabis.compliance_exception (
  id                    uuid primary key default gen_random_uuid(),
  facility_id           uuid not null references cannabis.facility(id) on delete cascade,
  exception_type        text not null, -- missing_coa, failed_test, expired_license, sync_error, etc.
  severity              text not null default 'warning', -- info, warning, critical
  status                text not null default 'open',    -- open, acknowledged, resolved, dismissed
  object_type           text,
  object_id             uuid,
  title                 text not null,
  description           text,
  due_at                timestamptz,
  resolved_at           timestamptz,
  resolved_by_user_id   uuid references cannabis.app_user(id) on delete set null,
  metadata              jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create table if not exists cannabis.compliance_task (
  id                        uuid primary key default gen_random_uuid(),
  facility_id               uuid not null references cannabis.facility(id) on delete cascade,
  compliance_exception_id   uuid references cannabis.compliance_exception(id) on delete set null,
  assigned_to_user_id       uuid references cannabis.app_user(id) on delete set null,
  task_type                 text not null,
  title                     text not null,
  description               text,
  status                    text not null default 'open', -- open, in_progress, completed, cancelled
  due_at                    timestamptz,
  completed_at              timestamptz,
  completed_by_user_id      uuid references cannabis.app_user(id) on delete set null,
  metadata                  jsonb not null default '{}'::jsonb,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- MVP: Policy pack registry
-- ---------------------------------------------------------------------------

create table if not exists cannabis.policy_pack_registry (
  id                    uuid primary key default gen_random_uuid(),
  code                  text not null unique, -- ny-metrc-v1, nm-biotrack-v1, fl-sts-v1
  name                  text not null,
  regulatory_system_id  uuid not null references cannabis.regulatory_system(id),
  jurisdiction_id       uuid references cannabis.jurisdiction(id),
  version               text not null,
  schema_version        text,
  status                text not null default 'active',
  metadata              jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes — canonical tables
-- ---------------------------------------------------------------------------

create index if not exists idx_organization_tenant_id
  on cannabis.organization (tenant_id);

create index if not exists idx_facility_org_id
  on cannabis.facility (organization_id);

create index if not exists idx_facility_jurisdiction_id
  on cannabis.facility (jurisdiction_id);

create index if not exists idx_license_org_id
  on cannabis.license (organization_id);

create index if not exists idx_facility_license_facility_id
  on cannabis.facility_license (facility_id);

create index if not exists idx_location_facility_id
  on cannabis.location (facility_id);

create index if not exists idx_location_parent_id
  on cannabis.location (parent_location_id);

create index if not exists idx_employee_facility_id
  on cannabis.employee (facility_id);

create index if not exists idx_device_terminal_facility_id
  on cannabis.device_terminal (facility_id);

create index if not exists idx_binding_facility_id
  on cannabis.facility_regulator_binding (facility_id);

create index if not exists idx_binding_regulatory_system_id
  on cannabis.facility_regulator_binding (regulatory_system_id);

create unique index if not exists ux_binding_active_env
  on cannabis.facility_regulator_binding (facility_id, regulatory_system_id, environment)
  where active = true;

create index if not exists idx_external_identifier_object
  on cannabis.external_identifier (object_type, object_id);

create index if not exists idx_external_identifier_ext
  on cannabis.external_identifier (external_id);

create index if not exists idx_strain_facility_id
  on cannabis.strain (facility_id);

create index if not exists idx_product_definition_facility_id
  on cannabis.product_definition (facility_id);

create index if not exists idx_plant_batch_facility_id
  on cannabis.plant_batch (facility_id);

create index if not exists idx_plant_facility_id
  on cannabis.plant (facility_id);

create index if not exists idx_plant_location_id
  on cannabis.plant (current_location_id);

create index if not exists idx_harvest_lot_facility_id
  on cannabis.harvest_lot (facility_id);

create index if not exists idx_harvest_lot_plant_plant_id
  on cannabis.harvest_lot_plant (plant_id);

create index if not exists idx_material_lot_facility_id
  on cannabis.material_lot (facility_id);

create index if not exists idx_material_lot_location_id
  on cannabis.material_lot (location_id);

create index if not exists idx_material_lot_product_definition_id
  on cannabis.material_lot (product_definition_id);

create index if not exists idx_process_run_facility_id
  on cannabis.process_run (facility_id);

create index if not exists idx_process_run_input_lot_id
  on cannabis.process_run_input (material_lot_id);

create index if not exists idx_process_run_output_lot_id
  on cannabis.process_run_output (material_lot_id);

create index if not exists idx_package_facility_id
  on cannabis.package (facility_id);

create index if not exists idx_package_material_lot_id
  on cannabis.package (material_lot_id);

create index if not exists idx_package_location_id
  on cannabis.package (location_id);

create index if not exists idx_package_unit_package_id
  on cannabis.package_unit (package_id);

create index if not exists idx_inventory_ledger_material_lot_id
  on cannabis.inventory_ledger_entry (material_lot_id, occurred_at desc);

create index if not exists idx_inventory_ledger_package_id
  on cannabis.inventory_ledger_entry (package_id, occurred_at desc);

create index if not exists idx_inventory_ledger_facility_occurred_at
  on cannabis.inventory_ledger_entry (facility_id, occurred_at desc);

create index if not exists idx_inventory_ledger_reference
  on cannabis.inventory_ledger_entry (reference_type, reference_id);

create index if not exists idx_lab_sample_facility_id
  on cannabis.lab_sample (facility_id);

create index if not exists idx_lab_result_sample_id
  on cannabis.lab_result (lab_sample_id);

create index if not exists idx_transfer_facility_id
  on cannabis.transfer (facility_id);

create index if not exists idx_transfer_line_transfer_id
  on cannabis.transfer_line (transfer_id);

create index if not exists idx_transfer_line_package_id
  on cannabis.transfer_line (package_id);

create index if not exists idx_customer_facility_id
  on cannabis.customer (facility_id);

create index if not exists idx_sale_facility_sold_at
  on cannabis.sale (facility_id, sold_at desc);

create index if not exists idx_sale_customer_id
  on cannabis.sale (customer_id);

create index if not exists idx_sale_employee_id
  on cannabis.sale (employee_id);

create index if not exists idx_sale_line_sale_id
  on cannabis.sale_line (sale_id);

create index if not exists idx_sale_line_package_id
  on cannabis.sale_line (package_id);

create index if not exists idx_sale_line_package_unit_id
  on cannabis.sale_line (package_unit_id);

create index if not exists idx_payment_sale_id
  on cannabis.payment (sale_id);

create index if not exists idx_outbox_status_available_at
  on cannabis.outbox_event (status, available_at, created_at);

create unique index if not exists ux_outbox_dedupe_key
  on cannabis.outbox_event (facility_id, dedupe_key)
  where dedupe_key is not null;

create index if not exists idx_sync_job_binding_status
  on cannabis.regulatory_sync_job (facility_regulator_binding_id, status, queued_at);

create index if not exists idx_sync_job_object
  on cannabis.regulatory_sync_job (object_type, object_id);

create index if not exists idx_sync_event_job_id
  on cannabis.regulatory_sync_event (regulatory_sync_job_id, occurred_at desc);

create index if not exists idx_audit_facility_occurred_at
  on cannabis.audit_event (facility_id, occurred_at desc);

create index if not exists idx_audit_object
  on cannabis.audit_event (object_type, object_id, occurred_at desc);

-- ---------------------------------------------------------------------------
-- Indexes — MVP additions
-- ---------------------------------------------------------------------------

create index if not exists idx_app_user_tenant_id
  on cannabis.app_user (tenant_id);

create index if not exists idx_auth_identity_app_user_id
  on cannabis.auth_identity (app_user_id);

create index if not exists idx_role_definition_tenant_id
  on cannabis.role_definition (tenant_id);

create index if not exists idx_role_binding_app_user_id
  on cannabis.role_binding (app_user_id);

create index if not exists idx_role_binding_facility_id
  on cannabis.role_binding (facility_id);

create index if not exists idx_role_binding_org_id
  on cannabis.role_binding (organization_id);

create index if not exists idx_module_setting_module_id
  on cannabis.module_setting (module_definition_id);

create index if not exists idx_module_setting_facility_id
  on cannabis.module_setting (facility_id);

create index if not exists idx_document_asset_tenant_id
  on cannabis.document_asset (tenant_id);

create index if not exists idx_document_asset_facility_id
  on cannabis.document_asset (facility_id);

create index if not exists idx_document_binding_object
  on cannabis.document_binding (object_type, object_id);

create index if not exists idx_document_binding_asset_id
  on cannabis.document_binding (document_asset_id);

create index if not exists idx_compliance_exception_facility_status
  on cannabis.compliance_exception (facility_id, status, created_at desc);

create index if not exists idx_compliance_exception_object
  on cannabis.compliance_exception (object_type, object_id);

create index if not exists idx_compliance_task_facility_status
  on cannabis.compliance_task (facility_id, status, due_at);

create index if not exists idx_compliance_task_exception_id
  on cannabis.compliance_task (compliance_exception_id);

create index if not exists idx_compliance_task_assigned_to
  on cannabis.compliance_task (assigned_to_user_id);

create index if not exists idx_policy_pack_reg_system_id
  on cannabis.policy_pack_registry (regulatory_system_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers (all tables that carry the column)
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'tenant',
    'organization',
    'jurisdiction',
    'facility',
    'license',
    'facility_license',
    'location',
    'employee',
    'device_terminal',
    'regulatory_system',
    'facility_regulator_binding',
    'external_identifier',
    'strain',
    'product_definition',
    'plant_batch',
    'plant',
    'harvest_lot',
    'material_lot',
    'process_run',
    'package',
    'package_unit',
    'lab_sample',
    'lab_result',
    'coa_document',
    'transfer',
    'transfer_line',
    'customer',
    'sale',
    'sale_line',
    'payment',
    'outbox_event',
    'regulatory_sync_job',
    'app_user',
    'auth_identity',
    'role_definition',
    'module_definition',
    'module_setting',
    'document_asset',
    'compliance_exception',
    'compliance_task',
    'policy_pack_registry'
  ]
  loop
    execute format(
      'drop trigger if exists %I_set_updated_at on cannabis.%I',
      t, t
    );
    execute format(
      'create trigger %I_set_updated_at
         before update on cannabis.%I
         for each row
         execute function cannabis.set_updated_at()',
      t, t
    );
  end loop;
end;
$$;

-- Down Migration

drop schema if exists cannabis cascade;
