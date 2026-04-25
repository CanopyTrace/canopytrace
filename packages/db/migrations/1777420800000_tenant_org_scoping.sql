-- Up Migration
-- Story 1.2.5: Denormalized tenant_id and organization_id on high-volume tables.
--
-- Added to: package, material_lot, sale, audit_event.
-- Skipped:  outbox_event, regulatory_sync_job — rationale below.
--
-- Design note
-- -----------
-- facility.organization_id and organization.tenant_id already provide the
-- authoritative path; these columns are intentionally redundant to avoid a
-- 2-hop join in hot query paths and to support simple row-level security
-- policies scoped at the org or tenant boundary.
--
-- Consistency is maintained by backfilling from the facility join at migration
-- time.  facility.organization_id is effectively immutable (moving a facility
-- between organizations is not a supported operation), so the risk of stale
-- denormalized values is negligible.  No trigger is added to auto-derive the
-- values — the application layer is responsible for supplying them at insert
-- time, which is the standard pattern for this schema.
--
-- Tables evaluated but skipped:
--
--   outbox_event
--     Infrastructure / messaging table.  Consumers are per-facility workers
--     that already carry facility_id in their context.  Cross-org outbox
--     processing has no meaningful use case.  Adding org/tenant would
--     complicate the (facility_id, dedupe_key) uniqueness semantics without
--     any query benefit.
--
--   regulatory_sync_job
--     Regulatory submissions are strictly per-facility-regulator-binding.
--     Each binding references exactly one facility; the join to org/tenant is
--     trivially cheap and is never needed at sync-job query time.  The
--     facility_regulator_binding_id column already encodes the full regulatory
--     context, making additional scoping columns redundant clutter.

set search_path = cannabis, public;

-- ---------------------------------------------------------------------------
-- package
-- ---------------------------------------------------------------------------

alter table cannabis.package
  add column if not exists tenant_id       uuid references cannabis.tenant(id)       on delete cascade,
  add column if not exists organization_id uuid references cannabis.organization(id) on delete cascade;

update cannabis.package p
set organization_id = f.organization_id,
    tenant_id       = o.tenant_id
from cannabis.facility     f
join cannabis.organization o on o.id = f.organization_id
where f.id = p.facility_id
  and p.organization_id is null;

alter table cannabis.package
  alter column tenant_id       set not null,
  alter column organization_id set not null;

-- Org-wide package inventory: the most common multi-facility query pattern.
create index if not exists idx_package_organization_id
  on cannabis.package (organization_id, package_status);

-- ---------------------------------------------------------------------------
-- material_lot
-- ---------------------------------------------------------------------------

alter table cannabis.material_lot
  add column if not exists tenant_id       uuid references cannabis.tenant(id)       on delete cascade,
  add column if not exists organization_id uuid references cannabis.organization(id) on delete cascade;

update cannabis.material_lot ml
set organization_id = f.organization_id,
    tenant_id       = o.tenant_id
from cannabis.facility     f
join cannabis.organization o on o.id = f.organization_id
where f.id = ml.facility_id
  and ml.organization_id is null;

alter table cannabis.material_lot
  alter column tenant_id       set not null,
  alter column organization_id set not null;

-- Org-wide lot status: cross-facility supply chain view.
create index if not exists idx_material_lot_organization_id
  on cannabis.material_lot (organization_id, status);

-- ---------------------------------------------------------------------------
-- sale
-- ---------------------------------------------------------------------------

alter table cannabis.sale
  add column if not exists tenant_id       uuid references cannabis.tenant(id)       on delete cascade,
  add column if not exists organization_id uuid references cannabis.organization(id) on delete cascade;

update cannabis.sale s
set organization_id = f.organization_id,
    tenant_id       = o.tenant_id
from cannabis.facility     f
join cannabis.organization o on o.id = f.organization_id
where f.id = s.facility_id
  and s.organization_id is null;

alter table cannabis.sale
  alter column tenant_id       set not null,
  alter column organization_id set not null;

-- Time-series revenue roll-up across an org's retail facilities.
create index if not exists idx_sale_organization_id
  on cannabis.sale (organization_id, sold_at desc);

-- Tenant-level analytics: multi-org dashboards and SaaS operator reporting.
create index if not exists idx_sale_tenant_id
  on cannabis.sale (tenant_id, sold_at desc);

-- ---------------------------------------------------------------------------
-- audit_event
-- ---------------------------------------------------------------------------

alter table cannabis.audit_event
  add column if not exists tenant_id       uuid references cannabis.tenant(id)       on delete cascade,
  add column if not exists organization_id uuid references cannabis.organization(id) on delete cascade;

update cannabis.audit_event ae
set organization_id = f.organization_id,
    tenant_id       = o.tenant_id
from cannabis.facility     f
join cannabis.organization o on o.id = f.organization_id
where f.id = ae.facility_id
  and ae.organization_id is null;

alter table cannabis.audit_event
  alter column tenant_id       set not null,
  alter column organization_id set not null;

-- Org-level compliance audit: auditors with an org-level role see all events
-- across every facility in the org.
create index if not exists idx_audit_event_organization_id
  on cannabis.audit_event (organization_id, occurred_at desc);

-- Tenant-wide security review: security team and incident response queries.
create index if not exists idx_audit_event_tenant_id
  on cannabis.audit_event (tenant_id, occurred_at desc);

-- Down Migration

drop index if exists cannabis.idx_audit_event_tenant_id;
drop index if exists cannabis.idx_audit_event_organization_id;

alter table cannabis.audit_event
  drop column if exists organization_id,
  drop column if exists tenant_id;

drop index if exists cannabis.idx_sale_tenant_id;
drop index if exists cannabis.idx_sale_organization_id;

alter table cannabis.sale
  drop column if exists organization_id,
  drop column if exists tenant_id;

drop index if exists cannabis.idx_material_lot_organization_id;

alter table cannabis.material_lot
  drop column if exists organization_id,
  drop column if exists tenant_id;

drop index if exists cannabis.idx_package_organization_id;

alter table cannabis.package
  drop column if exists organization_id,
  drop column if exists tenant_id;
