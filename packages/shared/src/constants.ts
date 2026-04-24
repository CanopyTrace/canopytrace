/**
 * Domain constants shared across all CanopyTrace packages.
 * No secrets, no environment-specific values.
 */

export const FACILITY_TYPES = [
  "cultivation",
  "processing",
  "retail",
  "distribution",
  "lab",
  "mixed",
] as const;

export const GROWTH_PHASES = ["clone", "seedling", "veg", "flower", "harvest"] as const;

export const LOT_KINDS = [
  "biomass",
  "extract",
  "wip",
  "bulk_finished",
  "waste",
  "trim",
  "crude_oil",
  "distillate",
  "edible_batch",
] as const;

export const LEDGER_EVENT_TYPES = [
  "create",
  "move",
  "adjust",
  "consume",
  "produce",
  "package",
  "split",
  "merge",
  "hold",
  "release",
  "waste",
  "sale",
] as const;

export const SYNC_STATUSES = [
  "queued",
  "processing",
  "succeeded",
  "failed",
  "dead_letter",
] as const;

export const REGULATORY_SYSTEMS = ["metrc", "biotrack"] as const;

export const TRANSFER_DIRECTIONS = ["inbound", "outbound"] as const;

export const CUSTOMER_TYPES = ["consumer", "patient", "wholesale"] as const;

export const PROCESS_RUN_TYPES = [
  "extraction",
  "infusion",
  "blending",
  "packaging",
  "remediation",
  "rework",
] as const;

/** Default page size for paginated list endpoints */
export const DEFAULT_PAGE_SIZE = 25;
/** Hard cap on page size to protect the DB */
export const MAX_PAGE_SIZE = 200;
