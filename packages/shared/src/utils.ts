/**
 * Pure utility helpers shared across all CanopyTrace packages.
 * No side-effects, no I/O, no secrets.
 */

import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "./constants.js";
import type { PaginatedResult, PaginationParams } from "./types.js";

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

export function parsePaginationParams(
  rawPage: unknown,
  rawPageSize: unknown,
): PaginationParams {
  const page = Math.max(1, Number.isFinite(Number(rawPage)) ? Number(rawPage) : 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(
      1,
      Number.isFinite(Number(rawPageSize)) ? Number(rawPageSize) : DEFAULT_PAGE_SIZE,
    ),
  );
  return { page, pageSize };
}

export function buildPaginatedResult<T>(
  items: T[],
  total: number,
  params: PaginationParams,
): PaginatedResult<T> {
  return {
    items,
    total,
    page: params.page,
    pageSize: params.pageSize,
    totalPages: Math.ceil(total / params.pageSize),
  };
}

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}

// ---------------------------------------------------------------------------
// Safe JSON
// ---------------------------------------------------------------------------

export function safeJsonParse<T = unknown>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
