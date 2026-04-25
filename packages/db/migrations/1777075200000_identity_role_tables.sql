-- Up Migration
-- Story 1.2.1: complete identity and role tables.
--
-- auth_identity: replaces the original (provider, provider_sub) unique with two
--   targeted constraints:
--     1. one identity per (user, provider) — prevents duplicate local rows per user
--     2. global OIDC deduplication via partial unique index (when provider_sub is set)
--   Adds credential-consistency checks so the DB enforces that local identities
--   always carry a password_hash and non-local identities always carry a provider_sub.
--
-- role_binding: adds optional module scope and a CHECK that prevents a binding
--   from targeting both organization and facility simultaneously.

set search_path = cannabis, public;

-- ---------------------------------------------------------------------------
-- auth_identity
-- ---------------------------------------------------------------------------

-- The original constraint unique(provider, provider_sub) does not protect against
-- two 'local' rows for the same user because NULL != NULL in unique checks.
-- Replace it with two purpose-built constraints below.
alter table cannabis.auth_identity
  drop constraint if exists auth_identity_provider_provider_sub_key;

-- One identity per (user, provider): prevents duplicate local or oidc rows per user.
alter table cannabis.auth_identity
  add constraint ux_auth_identity_user_provider
    unique (app_user_id, provider);

-- Global OIDC deduplication: a given (provider, subject) pair maps to exactly one user.
-- Partial index so that NULL provider_sub rows (local auth) are excluded.
create unique index if not exists ux_auth_identity_oidc_sub
  on cannabis.auth_identity (provider, provider_sub)
  where provider_sub is not null;

-- Local auth requires a password hash; non-local auth requires a subject claim.
alter table cannabis.auth_identity
  add constraint chk_auth_identity_local_has_hash
    check (provider != 'local' or password_hash is not null),
  add constraint chk_auth_identity_oidc_has_sub
    check (provider = 'local' or provider_sub is not null);

create index if not exists idx_auth_identity_app_user
  on cannabis.auth_identity (app_user_id);

-- ---------------------------------------------------------------------------
-- role_binding: module scope + ambiguity guard
-- ---------------------------------------------------------------------------

-- Supports module-gated permissions (e.g. the retail module within a facility).
-- NULL means the binding applies to all modules at its scope level.
alter table cannabis.role_binding
  add column if not exists module_definition_id uuid
    references cannabis.module_definition(id) on delete cascade;

-- A binding must target at most one explicit scope level.
-- tenant-level: both organization_id and facility_id are NULL
-- org-level:    organization_id is set, facility_id is NULL
-- facility-level: facility_id is set, organization_id is NULL
alter table cannabis.role_binding
  add constraint chk_role_binding_scope_exclusive
    check (organization_id is null or facility_id is null);

create index if not exists idx_role_binding_app_user
  on cannabis.role_binding (app_user_id);

create index if not exists idx_role_binding_role_definition
  on cannabis.role_binding (role_definition_id);

create index if not exists idx_role_binding_organization
  on cannabis.role_binding (organization_id)
  where organization_id is not null;

create index if not exists idx_role_binding_facility
  on cannabis.role_binding (facility_id)
  where facility_id is not null;

-- ---------------------------------------------------------------------------
-- app_user: index for tenant-scoped user queries
-- ---------------------------------------------------------------------------

create index if not exists idx_app_user_tenant
  on cannabis.app_user (tenant_id);

-- Down Migration

drop index if exists cannabis.idx_app_user_tenant;

drop index if exists cannabis.idx_role_binding_facility;
drop index if exists cannabis.idx_role_binding_organization;
drop index if exists cannabis.idx_role_binding_role_definition;
drop index if exists cannabis.idx_role_binding_app_user;

alter table cannabis.role_binding
  drop constraint if exists chk_role_binding_scope_exclusive,
  drop column if exists module_definition_id;

drop index if exists cannabis.idx_auth_identity_app_user;
drop index if exists cannabis.ux_auth_identity_oidc_sub;

alter table cannabis.auth_identity
  drop constraint if exists chk_auth_identity_oidc_has_sub,
  drop constraint if exists chk_auth_identity_local_has_hash,
  drop constraint if exists ux_auth_identity_user_provider;

alter table cannabis.auth_identity
  add constraint auth_identity_provider_provider_sub_key
    unique (provider, provider_sub);
