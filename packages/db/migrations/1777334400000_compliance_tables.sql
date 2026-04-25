-- Up Migration
-- Story 1.2.4: compliance exception, compliance task, and policy pack registry.
--
-- The baseline defines all three tables with status, severity, due dates,
-- user assignment, and the standard index set.
--
-- This migration adds what the baseline omits:
--   compliance_exception — source column to distinguish system-generated alerts
--                          from operator-created ones; severity+status index
--   compliance_task      — source column (mirrors exception); role-based assignment
--                          column for team-wide task routing; role assignment index
--   policy_pack_registry — jurisdiction lookup index

set search_path = cannabis, public;

-- ---------------------------------------------------------------------------
-- compliance_exception: machine vs. operator origin
-- ---------------------------------------------------------------------------

-- 'system'   — raised automatically by rule engine, regulatory sync, or data
--              quality checks; no human authored it
-- 'operator' — manually filed by a facility user via the UI
alter table cannabis.compliance_exception
  add column if not exists source text not null default 'system';

-- Fast path for "show me all critical open exceptions at this facility".
create index if not exists idx_compliance_exception_severity
  on cannabis.compliance_exception (facility_id, severity, status);

-- Separate queues for machine workflow (auto-resolve candidates) vs. operator triage.
create index if not exists idx_compliance_exception_source
  on cannabis.compliance_exception (source, facility_id, status);

-- ---------------------------------------------------------------------------
-- compliance_task: machine vs. operator origin + role-based assignment
-- ---------------------------------------------------------------------------

-- Same source semantics as compliance_exception.
-- 'system'   — created automatically when an exception is raised
-- 'operator' — manually created via the task UI
alter table cannabis.compliance_task
  add column if not exists source text not null default 'system';

-- Role-based assignment: route the task to anyone holding the given role at the
-- facility instead of pinning to a specific user.  User and role assignments are
-- intentionally independent; either, both, or neither may be set.
alter table cannabis.compliance_task
  add column if not exists assigned_to_role_definition_id uuid
    references cannabis.role_definition(id) on delete set null;

create index if not exists idx_compliance_task_source
  on cannabis.compliance_task (source, facility_id, status);

create index if not exists idx_compliance_task_assigned_role
  on cannabis.compliance_task (assigned_to_role_definition_id)
  where assigned_to_role_definition_id is not null;

-- ---------------------------------------------------------------------------
-- policy_pack_registry: jurisdiction lookup
-- ---------------------------------------------------------------------------

create index if not exists idx_policy_pack_jurisdiction_id
  on cannabis.policy_pack_registry (jurisdiction_id)
  where jurisdiction_id is not null;

-- Down Migration

drop index if exists cannabis.idx_policy_pack_jurisdiction_id;

drop index if exists cannabis.idx_compliance_task_assigned_role;
drop index if exists cannabis.idx_compliance_task_source;

alter table cannabis.compliance_task
  drop column if exists assigned_to_role_definition_id,
  drop column if exists source;

drop index if exists cannabis.idx_compliance_exception_source;
drop index if exists cannabis.idx_compliance_exception_severity;

alter table cannabis.compliance_exception
  drop column if exists source;
