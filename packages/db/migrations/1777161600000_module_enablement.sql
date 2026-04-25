-- Up Migration
-- Story 1.2.2: module definition and module setting tables.
--
-- The baseline already defines both tables and enforces the one-of-three scope
-- rule (exactly one of tenant_id/organization_id/facility_id must be set).
-- This migration adds what the baseline omits:
--   - partial unique indexes that prevent a module from having more than one
--     setting row at the same scope entity (duplicate scope collision guard)
--   - lookup indexes for the three scope FK columns (resolve effective settings
--     at runtime without seqscans)

set search_path = cannabis, public;

-- ---------------------------------------------------------------------------
-- module_setting: prevent duplicate (module, scope-entity) collisions
-- ---------------------------------------------------------------------------

-- Exactly one setting per module per tenant, per org, and per facility.
-- Partial indexes exclude NULL rows so each constraint applies independently.
create unique index if not exists ux_module_setting_tenant
  on cannabis.module_setting (module_definition_id, tenant_id)
  where tenant_id is not null;

create unique index if not exists ux_module_setting_organization
  on cannabis.module_setting (module_definition_id, organization_id)
  where organization_id is not null;

create unique index if not exists ux_module_setting_facility
  on cannabis.module_setting (module_definition_id, facility_id)
  where facility_id is not null;

-- Lookup indexes: resolve all enabled modules for a given scope entity
-- (common query path when building the effective feature-flag set for a request).
create index if not exists idx_module_setting_tenant
  on cannabis.module_setting (tenant_id)
  where tenant_id is not null;

create index if not exists idx_module_setting_organization
  on cannabis.module_setting (organization_id)
  where organization_id is not null;

create index if not exists idx_module_setting_facility
  on cannabis.module_setting (facility_id)
  where facility_id is not null;

-- Down Migration

drop index if exists cannabis.idx_module_setting_facility;
drop index if exists cannabis.idx_module_setting_organization;
drop index if exists cannabis.idx_module_setting_tenant;
drop index if exists cannabis.ux_module_setting_facility;
drop index if exists cannabis.ux_module_setting_organization;
drop index if exists cannabis.ux_module_setting_tenant;
