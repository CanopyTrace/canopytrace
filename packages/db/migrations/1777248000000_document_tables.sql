-- Up Migration
-- Story 1.2.3: document asset and document binding tables.
--
-- The baseline defines both tables with the core columns, the
-- (bucket, storage_key) uniqueness constraint on document_asset, and the
-- (asset, object_type, object_id, binding_role) uniqueness constraint on
-- document_binding.
--
-- This migration adds what the baseline omits:
--   document_asset  — lookup indexes for the common query paths
--   document_binding — metadata jsonb column for future access policy hooks;
--                      lookup index on (object_type, object_id) for the primary
--                      "fetch all documents attached to this record" path

set search_path = cannabis, public;

-- ---------------------------------------------------------------------------
-- document_asset: lookup indexes
-- ---------------------------------------------------------------------------

-- All documents belonging to a tenant (list / audit views).
create index if not exists idx_document_asset_tenant
  on cannabis.document_asset (tenant_id);

-- All documents scoped to a facility (facility-level evidence browser).
create index if not exists idx_document_asset_facility
  on cannabis.document_asset (facility_id)
  where facility_id is not null;

-- Documents uploaded by a specific user (user activity audit).
create index if not exists idx_document_asset_uploaded_by
  on cannabis.document_asset (uploaded_by_user_id)
  where uploaded_by_user_id is not null;

-- Content-based deduplication probe: find existing asset by checksum before upload.
create index if not exists idx_document_asset_sha256
  on cannabis.document_asset (sha256)
  where sha256 is not null;

-- ---------------------------------------------------------------------------
-- document_binding: access policy hook + lookup indexes
-- ---------------------------------------------------------------------------

-- Extensible metadata for future access policy attributes
-- (e.g. visibility scope, download expiry, role allow-list).
-- Bindings are otherwise immutable so this column is set at creation time only.
alter table cannabis.document_binding
  add column if not exists metadata jsonb not null default '{}'::jsonb;

-- Primary lookup path: "all documents attached to this domain object".
create index if not exists idx_document_binding_object
  on cannabis.document_binding (object_type, object_id);

-- Reverse lookup: all bindings for a given asset (used when deleting or auditing).
create index if not exists idx_document_binding_asset
  on cannabis.document_binding (document_asset_id);

-- Down Migration

drop index if exists cannabis.idx_document_binding_asset;
drop index if exists cannabis.idx_document_binding_object;

alter table cannabis.document_binding
  drop column if exists metadata;

drop index if exists cannabis.idx_document_asset_sha256;
drop index if exists cannabis.idx_document_asset_uploaded_by;
drop index if exists cannabis.idx_document_asset_facility;
drop index if exists cannabis.idx_document_asset_tenant;
